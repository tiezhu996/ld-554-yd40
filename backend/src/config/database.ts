import { Sequelize, type Dialect } from 'sequelize';

export const sequelize = new Sequelize(
  process.env.DB_NAME ?? 'bizstarter',
  process.env.DB_USER ?? 'root',
  process.env.DB_PASSWORD ?? '',
  {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    dialect: (process.env.DB_DIALECT ?? 'mysql') as Dialect,
    storage: process.env.DB_STORAGE,
    logging: false,
    define: {
      underscored: true,
      timestamps: true
    }
  }
);
