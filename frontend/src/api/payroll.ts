import { request } from '@/utils/request';

export function fetchPayrolls(params = {}) {
  return request.get('/payrolls', { params });
}

export function fetchPayroll(id: number) {
  return request.get(`/payrolls/${id}`);
}

export function generatePayroll(data: { storeId: number; month: string }) {
  return request.post('/payrolls/generate', data);
}
