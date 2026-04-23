import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js'
import { AppError } from './error-handler.js'

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
