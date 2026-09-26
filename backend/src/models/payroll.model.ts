import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Payroll extends Model<InferAttributes<Payroll>, InferCreationAttributes<Payroll>> {
  declare id: CreationOptional<number>;
  declare storeId: number;
  declare month: string;
  declare totalAmount: CreationOptional<number>;
  declare employeeCount: CreationOptional<number>;
  declare transactionId: CreationOptional<number | null>;
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
