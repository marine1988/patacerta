import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken, type TokenPayload } from '../lib/jwt.js'
import { AppError } from './error-handler.js'
import { prisma } from '../lib/prisma.js'
import { asyncHandler } from '../lib/helpers.js'

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
export const requireBreederProfile = asyncHandler(async (req, _res, next) => {
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

/**
 * Require que o utilizador autenticado nao esteja suspenso/inactivo.
 *
 * O JWT vive ate' 15 minutos; durante essa janela um admin pode ter
 * suspendido a conta mas o token continua valido. Sem este guard, o
 * utilizador suspenso podia ainda fazer mutations (enviar mensagens,
 * criar threads, editar perfis) durante o resto da TTL do token.
 *
 * Usar SO em mutations (POST/PATCH/DELETE) onde a accao tem efeito
 * externo. GETs read-only podem ser permitidos para que o utilizador
 * suspenso ainda possa exportar/ver os seus dados (RGPD). Cada uso
 * adiciona um findUnique (~1-3ms); se isto se tornar gargalo, pode-se
 * cachear `isActive` no proprio JWT na altura do login.
 *
 * Must be used AFTER requireAuth.
 */
export const requireActiveUser = asyncHandler(async (req, _res, next) => {
  if (!req.user) {
    throw new AppError(401, 'Não autenticado', 'UNAUTHORIZED')
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { isActive: true, suspendedAt: true },
  })
  if (!user) {
    // Conta apagada entretanto — token e' valido mas utilizador foi-se.
    throw new AppError(401, 'Conta não encontrada', 'USER_NOT_FOUND')
  }
  if (!user.isActive || user.suspendedAt) {
    throw new AppError(
      403,
      'A sua conta encontra-se suspensa. Contacte o suporte.',
      'ACCOUNT_SUSPENDED',
    )
  }
  next()
})
