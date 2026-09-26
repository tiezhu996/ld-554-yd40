export const financeRoutes = [
  { path: '/finance', name: 'finance', component: () => import('@/pages/finance/FinanceList.vue'), meta: { roles: ['OWNER', 'MANAGER'] } },
  { path: '/finance/payroll', name: 'payroll', component: () => import('@/pages/finance/Payroll.vue'), meta: { roles: ['OWNER', 'MANAGER'] } }
];
