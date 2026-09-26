import type { NextFunction, Request, Response } from 'express';
import * as payrollService from '../services/payroll.service.js';
import { success } from '../utils/response.js';

export async function index(req: Request, res: Response, next: NextFunction) {
  try {
    success(res, await payrollService.listPayrolls(req.query, req.user));
  } catch (error) {
    next(error);
  }
}

export async function show(req: Request, res: Response, next: NextFunction) {
  try {
    success(res, await payrollService.getPayroll(Number(req.params.id), req.user));
  } catch (error) {
    next(error);
  }
}

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeId, month } = req.body;
    success(res, await payrollService.generatePayroll(Number(storeId), String(month), req.user), '工资单已生成');
  } catch (error) {
    next(error);
  }
}
