import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { validate } from '../../middleware/validate.js'
import { updateUserSchema, changeUserRoleSchema } from '@patacerta/shared'
import * as ctrl from './users.controller.js'

export const usersRouter = Router()

// Current user
usersRouter.get('/me', requireAuth, ctrl.getMe)
usersRouter.patch('/me', requireAuth, validate(updateUserSchema), ctrl.updateMe)
usersRouter.delete('/me', requireAuth, ctrl.deleteMe)

// Avatar (current user). Multer e' chamado dentro do controller para
// poder devolver AppError consistente em vez de erros opacos de multer.
usersRouter.post('/me/avatar', requireAuth, ctrl.uploadMyAvatar)
usersRouter.delete('/me/avatar', requireAuth, ctrl.deleteMyAvatar)

// Admin: list/manage users
usersRouter.get('/', requireAuth, requireRole('ADMIN'), ctrl.listUsers)
usersRouter.get('/:id', requireAuth, requireRole('ADMIN'), ctrl.getUserById)
usersRouter.patch(
  '/:id/role',
  requireAuth,
  requireRole('ADMIN'),
  validate(changeUserRoleSchema),
  ctrl.changeUserRole,
)
