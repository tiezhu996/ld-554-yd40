import { Router } from 'express';
import * as controller from '../controllers/payroll.controller.js';
import { UserRole } from '../constants/enums.js';
import { auditMiddleware } from '../middlewares/audit.middleware.js';
import { requireRoles } from '../middlewares/rbac.middleware.js';
import { requireFields } from '../middlewares/validator.middleware.js';

export const payrollRoutes = Router();

payrollRoutes.get('/', requireRoles([UserRole.OWNER, UserRole.MANAGER]), controller.index);
payrollRoutes.get('/:id', requireRoles([UserRole.OWNER, UserRole.MANAGER]), controller.show);
payrollRoutes.post(
  '/generate',
  requireRoles([UserRole.OWNER, UserRole.MANAGER]),
  requireFields(['storeId', 'month']),
  auditMiddleware('GENERATE_PAYROLL', 'payrolls'),
  controller.generate
);
