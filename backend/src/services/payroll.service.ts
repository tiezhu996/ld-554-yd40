import { Op, UniqueConstraintError, type WhereOptions } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Employee, Payroll, PayrollItem, Shift, Store, Transaction } from '../models/index.js';
import { EmployeeStatus, ShiftType, TransactionCategory, TransactionType, UserRole } from '../constants/enums.js';
import { getPagination } from '../utils/pagination.js';
import { storeScope } from './scope.service.js';
import type { AuthUser } from '../types/request.js';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface PayrollItemInput {
  employeeId: number;
  confirmedShifts: number;
  payableCents: number;
}

export function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth
  };
}

// 应付金额 = 月薪 ÷ 当月自然天数 × 已确认班次数，按分计算避免浮点误差
export function computePayrollItems(
  employees: Array<{ id: number; salary: number | string }>,
  confirmedShiftCounts: Map<number, number>,
  daysInMonth: number
): PayrollItemInput[] {
  return employees
    .map((employee) => {
      const confirmedShifts = confirmedShiftCounts.get(employee.id) ?? 0;
      const salaryCents = Math.round(Number(employee.salary) * 100);
      const payableCents = Math.round((salaryCents * confirmedShifts) / daysInMonth);
      return { employeeId: employee.id, confirmedShifts, payableCents };
    })
    .filter((item) => item.confirmedShifts > 0);
}

export async function listPayrolls(query: Record<string, unknown>, user?: AuthUser) {
  const { page, pageSize, limit, offset } = getPagination(query);
  const where: WhereOptions = { ...storeScope(user) };
  if (query.storeId) Object.assign(where, { storeId: query.storeId });
  if (query.month) Object.assign(where, { month: query.month });
  const { rows, count } = await Payroll.findAndCountAll({
    where,
    limit,
    offset,
    include: [Store],
    order: [['month', 'DESC'], ['id', 'DESC']]
  });
  return { list: rows, total: count, page, pageSize };
}

export async function getPayroll(id: number, user?: AuthUser) {
  const payroll = await Payroll.findOne({
    where: { id, ...storeScope(user) },
    include: [Store, { model: PayrollItem, include: [Employee] }]
  });
  if (!payroll) throw Object.assign(new Error('工资单不存在'), { status: 404 });
  return payroll;
}

export async function generatePayroll(storeId: number, month: string, user?: AuthUser) {
  if (!MONTH_PATTERN.test(month)) throw Object.assign(new Error('月份格式应为 YYYY-MM'), { status: 400 });
  if (user?.role === UserRole.MANAGER && user.storeId !== storeId) {
    throw Object.assign(new Error('无权限为该门店生成工资单'), { status: 403 });
  }
  const store = await Store.findByPk(storeId);
  if (!store) throw Object.assign(new Error('门店不存在'), { status: 404 });

  const { startDate, endDate, daysInMonth } = monthRange(month);
  const description = `${store.name} ${month} 月工资`;

  return sequelize.transaction(async (t) => {
    // 同一门店同一月份只保留一条工资单：先查，查不到则插入；
    // 并发插入撞 (store_id, month) 唯一键时，重新加行锁读取已存在的那条
    let payroll = await Payroll.findOne({ where: { storeId, month }, transaction: t, lock: true });
    if (!payroll) {
      try {
        payroll = await Payroll.create({ storeId, month }, { transaction: t });
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) throw error;
        payroll = await Payroll.findOne({ where: { storeId, month }, transaction: t, lock: true });
        if (!payroll) throw error;
      }
    }

    // 在职员工（试用 + 正式，不含离职）
    const employees = await Employee.findAll({
      where: { storeId, status: { [Op.in]: [EmployeeStatus.ON_PROBATION, EmployeeStatus.ACTIVE] } },
      transaction: t
    });

    // 当月已确认班次（已确认/已打卡，休息班不计入出勤）
    const shifts = await Shift.findAll({
      where: {
        storeId,
        date: { [Op.between]: [startDate, endDate] },
        status: { [Op.in]: ['CONFIRMED', 'CHECKED_IN'] },
        shiftType: { [Op.ne]: ShiftType.REST }
      },
      attributes: ['employeeId'],
      transaction: t
    });
    const confirmedShiftCounts = new Map<number, number>();
    for (const shift of shifts) {
      confirmedShiftCounts.set(shift.employeeId, (confirmedShiftCounts.get(shift.employeeId) ?? 0) + 1);
    }

    // 每次生成都按最新已确认班次整体重算明细：
    // 新确认的员工补进来，已算过的员工只更新金额，不会重复计薪
    const desired = computePayrollItems(employees, confirmedShiftCounts, daysInMonth);
    const desiredByEmployee = new Map(desired.map((item) => [item.employeeId, item]));

    const existingItems = await PayrollItem.findAll({ where: { payrollId: payroll.id }, transaction: t, lock: true });
    for (const item of existingItems) {
      const next = desiredByEmployee.get(item.employeeId);
      if (!next) {
        await item.destroy({ transaction: t });
      } else if (item.confirmedShifts !== next.confirmedShifts || Math.round(Number(item.payableAmount) * 100) !== next.payableCents) {
        await item.update(
          { confirmedShifts: next.confirmedShifts, payableAmount: next.payableCents / 100 },
          { transaction: t }
        );
      }
    }
    const existingEmployeeIds = new Set(existingItems.map((item) => item.employeeId));
    for (const item of desired) {
      if (existingEmployeeIds.has(item.employeeId)) continue;
      await PayrollItem.create(
        {
          payrollId: payroll.id,
          employeeId: item.employeeId,
          confirmedShifts: item.confirmedShifts,
          payableAmount: item.payableCents / 100
        },
        { transaction: t }
      );
    }

    const totalCents = desired.reduce((sum, item) => sum + item.payableCents, 0);
    const totalAmount = totalCents / 100;

    // 整月总额只记一笔工资支出：已有关联流水则同步金额，否则新建并关联
    let transactionId = payroll.transactionId;
    if (transactionId) {
      const existing = await Transaction.findByPk(transactionId, { transaction: t });
      if (existing) {
        await existing.update({ amount: totalAmount, date: endDate, description }, { transaction: t });
      } else {
        transactionId = null;
      }
    }
    if (!transactionId && totalCents > 0) {
      const transaction = await Transaction.create(
        {
          type: TransactionType.EXPENSE,
          category: TransactionCategory.SALARY,
          amount: totalAmount,
          description,
          relatedEmployeeId: null,
          storeId,
          date: endDate
        },
        { transaction: t }
      );
      transactionId = transaction.id;
    }

    await payroll.update({ totalAmount, employeeCount: desired.length, transactionId }, { transaction: t });

    return Payroll.findByPk(payroll.id, {
      include: [Store, { model: PayrollItem, include: [Employee] }],
      transaction: t
    });
  });
}
