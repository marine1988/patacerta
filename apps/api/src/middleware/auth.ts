import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js'
import { AppError } from './error-handler.js'
import { prisma } from '../lib/prisma.js'

/**
 * Wraps an async middleware so promise rejections are forwarded to next().
 * Sem isto, throws/rejects num async middleware tornam-se unhandled
 * rejections em Express 4 — o processo crasha e o nginx devolve 502.
 */
function asyncMiddleware(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload
    }
  }
}

/** Require valid JWT */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'Token de autenticação em falta', 'UNAUTHORIZED')
  }

  try {
    const token = header.slice(7)
    req.user = verifyAccessToken(token)
    next()
  } catch {
    throw new AppError(401, 'Token inválido ou expirado', 'INVALID_TOKEN')
  }
}

/** Require specific role(s) — must be used AFTER requireAuth */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, 'Não autenticado', 'UNAUTHORIZED')
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'Sem permissões para esta ação', 'FORBIDDEN')
    }
    next()
  }
}

/** Attach user if a valid token is present; otherwise proceed anonymously. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7))
    } catch {
      // Ignore invalid tokens on optional auth; treat as anonymous.
    }
  }
  next()
}

/**
 * Require that the authenticated user has a Breeder profile.
 * Substitui o antigo requireRole('BREEDER'): com o novo modelo de registo
 * unificado, ser criador deriva de ter um perfil, não de um campo role.
 * Must be used AFTER requireAuth.
 */
export const requireBreederProfile = asyncMiddleware(async (req, _res, next) => {
  if (!req.user) {
    throw new AppError(401, 'Não autenticado', 'UNAUTHORIZED')
  }
  const breeder = await prisma.breeder.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  })
  if (!breeder) {
    throw new AppError(
      403,
      'Necessita de criar um perfil de criador para esta acção',
      'BREEDER_PROFILE_REQUIRED',
    )
  }
  next()
})
