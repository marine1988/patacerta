import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { updateUserSchema, changeUserRoleSchema, paginationQuerySchema } from '@patacerta/shared'
import { uploadRateLimit } from '../../middleware/rate-limit.js'
import * as ctrl from './users.controller.js'

export const usersRouter = Router()

// Schema local para a listagem legada /api/users (a admin UI usa
// /api/admin/users; este endpoint duplicado fica para compatibilidade
// mas valida o input para evitar ILIKE unbounded + role enum bypass).
const listLegacyUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['OWNER', 'BREEDER', 'SERVICE_PROVIDER', 'ADMIN']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
})

// Current user
usersRouter.get('/me', requireAuth, ctrl.getMe)
usersRouter.patch('/me', requireAuth, validate(updateUserSchema), ctrl.updateMe)
usersRouter.delete('/me', requireAuth, ctrl.deleteMe)

// Avatar (current user). Multer e' chamado dentro do controller para
// poder devolver AppError consistente em vez de erros opacos de multer.
// uploadRateLimit limita o custo de CPU (sharp) + I/O (MinIO) por user.
usersRouter.post('/me/avatar', requireAuth, uploadRateLimit, ctrl.uploadMyAvatar)
usersRouter.delete('/me/avatar', requireAuth, uploadRateLimit, ctrl.deleteMyAvatar)

// Admin: list/manage users
usersRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN'),
  validate(listLegacyUsersQuerySchema, 'query'),
  ctrl.listUsers,
)
usersRouter.get('/:id', requireAuth, requireRole('ADMIN'), ctrl.getUserById)
usersRouter.patch(
  '/:id/role',
  requireAuth,
  requireRole('ADMIN'),
  validate(changeUserRoleSchema),
  ctrl.changeUserRole,
)
