import { Op, type Transaction as DbTransaction, type WhereOptions } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Employee, Payroll, PayrollItem, Shift, Store, Transaction } from '../models/index.js';
import { EmployeeStatus, TransactionCategory, TransactionType, UserRole } from '../constants/enums.js';
import { getPagination } from '../utils/pagination.js';
import { storeScope } from './scope.service.js';
import type { AuthUser } from '../types/request.js';

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(month: string) {
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(daysInMonth).padStart(2, '0')}`,
    daysInMonth
  };
}

/**
 * 计算某门店某月应计薪明细：
 * 在职（含试用）员工当月存在已确认/已打卡的非休息班次才计入；
 * 应付金额 = 月薪 / 当月自然天数 * 已确认出勤天数（同一天多个班次只算一天）。
 */
async function computePayrollItems(storeId: number, month: string, transaction?: DbTransaction) {
  const { start, end, daysInMonth } = monthRange(month);
  const employees = await Employee.findAll({
    where: { storeId, status: { [Op.in]: [EmployeeStatus.ACTIVE, EmployeeStatus.ON_PROBATION] } },
    transaction
  });
  const shifts = await Shift.findAll({
    where: {
      storeId,
      date: { [Op.between]: [start, end] },
      status: { [Op.in]: ['CONFIRMED', 'CHECKED_IN'] },
      shiftType: { [Op.ne]: 'REST' }
    },
    attributes: ['employeeId', 'date'],
    transaction
  });
  const daysByEmployee = new Map<number, Set<string>>();
  for (const shift of shifts) {
    const days = daysByEmployee.get(shift.employeeId) ?? new Set<string>();
    days.add(String(shift.date));
    daysByEmployee.set(shift.employeeId, days);
  }
  return employees
    .map((employee) => {
      const confirmedDays = daysByEmployee.get(employee.id)?.size ?? 0;
      const amount = Math.round((Number(employee.salary) / daysInMonth) * confirmedDays * 100) / 100;
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        monthlySalary: Number(employee.salary),
        confirmedDays,
        amount
      };
    })
    .filter((item) => item.confirmedDays > 0);
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
    include: [Store, { model: PayrollItem, as: 'items' }],
    order: [['month', 'DESC'], ['id', 'DESC']],
    distinct: true
  });
  return { list: rows, total: count, page, pageSize };
}

export async function getPayroll(id: number, user?: AuthUser) {
  const payroll = await Payroll.findOne({
    where: { id, ...storeScope(user) },
    include: [Store, { model: PayrollItem, as: 'items' }]
  });
  if (!payroll) throw Object.assign(new Error('工资单不存在'), { status: 404 });
  return payroll;
}

/**
 * 生成（或补算）某门店某月工资单，幂等：
 * - payrolls 表 (store_id, month) 唯一索引保证同一门店同一月份只有一条工资单，
 *   重复点击或并发点击不会产生第二条；
 * - INSERT IGNORE + 行锁串行化并发请求；
 * - 明细按 (payroll_id, employee_id) 唯一键 upsert，已计薪员工不会重复计入，
 *   只刷新其确认天数与金额；当月班次后确认的员工会在此补入；
 * - 总额始终由明细实时求和得出，不会翻倍；
 * - 整月总额只对应一笔 SALARY 支出流水，重复生成时更新该流水金额而非新增。
 */
export async function generatePayroll(storeId: number, month: string, user?: AuthUser) {
  if (!MONTH_PATTERN.test(month)) {
    throw Object.assign(new Error('月份格式应为 YYYY-MM'), { status: 400 });
  }
  if (user?.role === UserRole.MANAGER && user.storeId !== storeId) {
    throw Object.assign(new Error('只能生成本门店的工资单'), { status: 403 });
  }
  const store = await Store.findByPk(storeId);
  if (!store) throw Object.assign(new Error('门店不存在'), { status: 404 });

  const payrollId = await sequelize.transaction(async (t) => {
    await Payroll.bulkCreate([{ storeId, month }], { ignoreDuplicates: true, transaction: t });
    const payroll = await Payroll.findOne({
      where: { storeId, month },
      lock: t.LOCK.UPDATE,
      transaction: t
    });
    if (!payroll) throw Object.assign(new Error('工资单创建失败'), { status: 500 });

    const items = await computePayrollItems(storeId, month, t);
    if (items.length) {
      await PayrollItem.bulkCreate(
        items.map((item) => ({ ...item, payrollId: payroll.id })),
        { updateOnDuplicate: ['employeeName', 'monthlySalary', 'confirmedDays', 'amount'], transaction: t }
      );
    }

    const total = await PayrollItem.sum('amount', { where: { payrollId: payroll.id }, transaction: t });
    const employeeCount = await PayrollItem.count({ where: { payrollId: payroll.id }, transaction: t });
    const totalAmount = Math.round(Number(total ?? 0) * 100) / 100;

    const description = `${store.name} ${month} 月工资（${employeeCount} 人）`;
    let transactionId = payroll.transactionId;
    if (transactionId) {
      const transaction = await Transaction.findByPk(transactionId, { transaction: t });
      if (transaction) {
        await transaction.update({ amount: totalAmount, description }, { transaction: t });
      } else {
        transactionId = null;
      }
    }
    if (!transactionId) {
      const transaction = await Transaction.create(
        {
          type: TransactionType.EXPENSE,
          category: TransactionCategory.SALARY,
          amount: totalAmount,
          description,
          relatedEmployeeId: null,
          storeId,
          date: monthRange(month).end,
          receipt: null,
          reviewed: false
        },
        { transaction: t }
      );
      transactionId = transaction.id;
    }

    await payroll.update({ totalAmount, employeeCount, transactionId }, { transaction: t });
    return payroll.id;
  });

  return getPayroll(payrollId, user);
}
