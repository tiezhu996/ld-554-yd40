import type { Employee } from './employee';
import type { Store } from './store';

export interface PayrollItem {
  id: number;
  payrollId: number;
  employeeId: number;
  confirmedShifts: number;
  payableAmount: number;
  Employee?: Employee;
}

export interface Payroll {
  id: number;
  storeId: number;
  month: string;
  totalAmount: number;
  employeeCount: number;
  transactionId: number | null;
  updatedAt?: string;
  Store?: Store;
  PayrollItems?: PayrollItem[];
}
