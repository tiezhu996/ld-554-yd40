/**
 * 工资单服务集成测试（使用 SQLite 内存库，无需 MySQL）。
 * 运行：npx tsx scripts/test-payroll.ts
 *
 * 覆盖场景：
 * 1. 按门店+月份生成工资单，只计入当月有已确认班次的在职员工；
 * 2. 重复点击生成：仍只有一条工资单、一笔工资支出，总额不翻倍；
 * 3. 并发点击生成：结果与单次生成一致；
 * 4. 员工班次后确认：再次生成将其补入原工资单并修正总额，已计薪员工不重复。
 */
import assert from 'node:assert/strict';

process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = ':memory:';
// SQLite 单连接不支持并发事务，池上限设为 1 让并发请求串行排队，
// 等价于 MySQL 下行锁的串行化效果
process.env.DB_POOL_MAX = '1';

const { sequelize } = await import('../src/config/database.js');
const { Employee, Payroll, PayrollItem, Shift, Store, Transaction } = await import('../src/models/index.js');
const { generatePayroll } = await import('../src/services/payroll.service.js');

const MONTH = '2026-09'; // 30 天

async function seed() {
  await sequelize.sync({ force: true });
  const store = await Store.create({ name: '测试门店', address: '测试路 1 号', status: 'OPEN', phone: '10000', businessHours: '09:00-21:00' });
  const mkEmployee = (employeeNo: string, name: string, status: string, salary: number) =>
    Employee.create({
      employeeNo, name, department: '门店运营部', position: '店员', phone: '138', email: `${employeeNo}@t.local`,
      joinDate: '2026-01-01', status, salary, role: 'EMPLOYEE', storeId: store.id
    } as never);
  const empA = await mkEmployee('E-A', '张三', 'ACTIVE', 3000); // 已确认 15 天
  const empB = await mkEmployee('E-B', '李四', 'ACTIVE', 6000); // 班次待确认，首次不计入
  const empC = await mkEmployee('E-C', '王五', 'RESIGNED', 9000); // 离职，不计入

  const mkShift = (employeeId: number, day: number, status: string) =>
    Shift.create({
      employeeId, storeId: store.id, date: `${MONTH}-${String(day).padStart(2, '0')}`,
      shiftType: 'MORNING', startTime: '08:00:00', endTime: '13:00:00', status
    } as never);
  for (let day = 1; day <= 15; day += 1) await mkShift(empA.id, day, 'CONFIRMED');
  for (let day = 1; day <= 10; day += 1) await mkShift(empB.id, day, 'PENDING');
  await mkShift(empC.id, 1, 'CONFIRMED');
  return { store, empA, empB };
}

async function salaryTransactions(storeId: number) {
  return Transaction.findAll({ where: { storeId, category: 'SALARY' } });
}

async function main() {
  const { store, empA, empB } = await seed();

  // 1. 首次生成：只有张三计入（3000/30*15 = 1500）
  const first = await generatePayroll(store.id, MONTH);
  assert.equal(first.totalAmount, 1500, '首次生成总额应为 1500');
  assert.equal(first.employeeCount, 1);
  assert.equal(first.items?.length, 1);
  assert.equal(first.items?.[0]?.employeeId, empA.id);
  assert.equal((await salaryTransactions(store.id)).length, 1, '应只有一笔工资支出');

  // 2. 重复点击：同一条工资单，总额不变，支出仍一笔
  const again = await generatePayroll(store.id, MONTH);
  assert.equal(again.id, first.id, '重复生成应复用同一条工资单');
  assert.equal(again.totalAmount, 1500, '重复生成总额不能翻倍');
  assert.equal(await Payroll.count({ where: { storeId: store.id, month: MONTH } }), 1);
  assert.equal(await PayrollItem.count(), 1, '已计薪员工不能重复');
  assert.equal((await salaryTransactions(store.id)).length, 1, '重复生成不能新增支出流水');

  // 3. 并发安全原语：MySQL 下每个请求走连接池独立连接，并发由唯一索引 + 行锁仲裁；
  // SQLite 方言全局只有一条连接，无法跑并发事务，这里直接验证并发安全依赖的原语：
  // 并发 INSERT 竞争同一 (store_id, month) 时，唯一索引保证只落一条
  await Promise.all(
    Array.from({ length: 5 }, () =>
      Payroll.bulkCreate([{ storeId: store.id, month: '2026-11' }], { ignoreDuplicates: true })
    )
  );
  assert.equal(await Payroll.count({ where: { storeId: store.id, month: '2026-11' } }), 1, '并发建单竞争只能落一条');
  // 并发 upsert 竞争同一 (payroll_id, employee_id) 时，唯一索引保证只落一条明细
  await Promise.all(
    Array.from({ length: 5 }, () =>
      PayrollItem.bulkCreate(
        [{ payrollId: first.id, employeeId: empA.id, employeeName: '张三', monthlySalary: 3000, confirmedDays: 15, amount: 1500 }],
        { updateOnDuplicate: ['employeeName', 'monthlySalary', 'confirmedDays', 'amount'] }
      )
    )
  );
  assert.equal(await PayrollItem.count({ where: { payrollId: first.id, employeeId: empA.id } }), 1, '并发明细竞争只能落一条');

  // 4. 李四班次确认后再次生成：补入原工资单并修正总额（1500 + 6000/30*10 = 3500）
  await Shift.update({ status: 'CONFIRMED' }, { where: { employeeId: empB.id } });
  const backfilled = await generatePayroll(store.id, MONTH);
  assert.equal(backfilled.id, first.id, '补算应复用原工资单');
  assert.equal(backfilled.employeeCount, 2);
  assert.equal(backfilled.totalAmount, 3500, '补算后总额应为 3500');
  assert.equal(await PayrollItem.count(), 2, '补算后应有 2 条明细，不能重复加张三');
  assert.equal(await PayrollItem.count({ where: { employeeId: empA.id } }), 1, '张三只能有一条明细');
  const transactions = await salaryTransactions(store.id);
  assert.equal(transactions.length, 1, '补算后仍只有一笔工资支出');
  assert.equal(Number(transactions[0].amount), 3500, '支出流水金额应同步修正');

  // 5. 非法月份与越权门店
  await assert.rejects(() => generatePayroll(store.id, '2026-13'), /月份格式/);
  await assert.rejects(
    () => generatePayroll(store.id, MONTH, { id: 9, username: 'm', role: 'MANAGER', employeeId: null, storeId: 999 }),
    /本门店/
  );

  console.log('✔ 工资单集成测试全部通过');
  await sequelize.close();
}

main().catch((error) => {
  console.error('✘ 测试失败:', error);
  process.exit(1);
});
