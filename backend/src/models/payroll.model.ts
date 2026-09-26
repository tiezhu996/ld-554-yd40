import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from 'sequelize';
import { sequelize } from '../config/database.js';
import type { PayrollItem } from './payroll-item.model.js';

export class Payroll extends Model<InferAttributes<Payroll>, InferCreationAttributes<Payroll>> {
  declare id: CreationOptional<number>;
  declare storeId: number;
  /** 工资月份，格式 YYYY-MM */
  declare month: string;
  declare totalAmount: CreationOptional<number>;
  declare employeeCount: CreationOptional<number>;
  /** 关联的工资支出流水 id，整月只有一笔 */
  declare transactionId: number | null;
  /** 计薪明细（include 加载） */
  declare items?: NonAttribute<PayrollItem[]>;
}

Payroll.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    storeId: { type: DataTypes.INTEGER, allowNull: false },
    month: { type: DataTypes.STRING(7), allowNull: false },
    totalAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    employeeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    transactionId: { type: DataTypes.INTEGER, allowNull: true }
  },
  {
    sequelize,
    tableName: 'payrolls',
    indexes: [{ unique: true, fields: ['store_id', 'month'] }]
  }
);
