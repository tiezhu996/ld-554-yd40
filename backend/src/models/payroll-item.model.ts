import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class PayrollItem extends Model<InferAttributes<PayrollItem>, InferCreationAttributes<PayrollItem>> {
  declare id: CreationOptional<number>;
  declare payrollId: number;
  declare employeeId: number;
  /** 员工姓名快照 */
  declare employeeName: string;
  /** 计薪时月薪快照 */
  declare monthlySalary: number;
  /** 当月已确认出勤天数 */
  declare confirmedDays: number;
  /** 应付金额 */
  declare amount: number;
}

PayrollItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    payrollId: { type: DataTypes.INTEGER, allowNull: false },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    employeeName: { type: DataTypes.STRING(60), allowNull: false },
    monthlySalary: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    confirmedDays: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
  },
  {
    sequelize,
    tableName: 'payroll_items',
    indexes: [{ unique: true, fields: ['payroll_id', 'employee_id'] }]
  }
);
