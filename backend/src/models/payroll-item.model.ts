import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class PayrollItem extends Model<InferAttributes<PayrollItem>, InferCreationAttributes<PayrollItem>> {
  declare id: CreationOptional<number>;
  declare payrollId: number;
  declare employeeId: number;
  declare confirmedShifts: number;
  declare payableAmount: number;
}

PayrollItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    payrollId: { type: DataTypes.INTEGER, allowNull: false },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    confirmedShifts: { type: DataTypes.INTEGER, allowNull: false },
    payableAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
  },
  {
    sequelize,
    tableName: 'payroll_items',
    indexes: [{ unique: true, fields: ['payroll_id', 'employee_id'] }]
  }
);
