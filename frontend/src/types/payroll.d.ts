export interface PayrollItem {
  id: number;
  payrollId: number;
  employeeId: number;
  employeeName: string;
  monthlySalary: number;
  confirmedDays: number;
  amount: number;
}

export interface Payroll {
  id: number;
  storeId: number;
  month: string;
  totalAmount: number;
  employeeCount: number;
  transactionId: number | null;
  items?: PayrollItem[];
}
