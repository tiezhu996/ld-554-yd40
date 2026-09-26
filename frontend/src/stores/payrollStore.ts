import { defineStore } from 'pinia';
import { fetchPayrolls } from '@/api/payroll';
import type { Payroll } from '@/types/payroll';

export const usePayrollStore = defineStore('payrolls', {
  state: () => ({ list: [] as Payroll[], total: 0 }),
  actions: {
    async load(params = {}) {
      const response = await fetchPayrolls(params) as { data: { list: Payroll[]; total: number } };
      this.list = response.data.list;
      this.total = response.data.total;
    }
  }
});
