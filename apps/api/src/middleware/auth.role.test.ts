/**
 * SEC-09 — o `role` usado em autorização vem SEMPRE da BD, nunca do JWT.
 *
 * O access token vive 15 min e carrega o role do momento do login. Sem
 * re-leitura, um admin despromovido a OWNER mantinha poderes administrativos
 * até ao fim da TTL. `requireActiveUser` re-lê o role e sobrescreve
 * `req.user.role`; `requireRole` avalia esse valor (e, fail-closed, re-lê-o
 * sozinho se alguma rota se esquecer do `requireActiveUser`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

vi.mock('../lib/prisma.js', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

import { requireActiveUser, requireRole } from './auth.js'
import { prisma } from '../lib/prisma.js'
import { AppError } from './error-handler.js'
import type { TokenPayload } from '../lib/jwt.js'

type Middleware = (req: Request, res: Response, next: NextFunction) => void

const findUnique = vi.mocked(prisma.user.findUnique)

function userRow(
  overrides: Partial<{ isActive: boolean; suspendedAt: Date | null; role: string }> = {},
) {
  return { isActive: true, suspendedAt: null, role: 'USER', ...overrides }
}

function reqWithUser(role: string, userId = 7): Request {
  return { user: { userId, email: 'ana@example.com', role } } as unknown as Request & {
    user: TokenPayload
  }
}

/**
 * Corre uma cadeia de middleware como o Express faria: `next()` avança,
 * `next(err)` para a cadeia. Resolve quando a cadeia termina ou falha.
 */
function runChain(
  middlewares: Middleware[],
  req: Request,
): Promise<{ error?: unknown; completed: boolean }> {
  return new Promise((resolve) => {
    let index = 0
    const next = (err?: unknown) => {
      if (err) return resolve({ error: err, completed: false })
      if (index >= middlewares.length) return resolve({ error: undefined, completed: true })
      middlewares[index++](req, {} as Response, next as unknown as NextFunction)
    }
    next()
  })
}

describe('SEC-09 — requireActiveUser re-lê o role da BD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sobrescreve o role do JWT com o role da BD (ADMIN → USER)', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'USER' }) as never)
    const req = reqWithUser('ADMIN')

    const { error, completed } = await runChain([requireActiveUser], req)

    expect(error).toBeUndefined()
    expect(completed).toBe(true)
    expect(req.user!.role).toBe('USER')
  })

  it('promove também no sentido inverso (OWNER → ADMIN) sem novo login', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'ADMIN' }) as never)
    const req = reqWithUser('OWNER')

    await runChain([requireActiveUser], req)

    expect(req.user!.role).toBe('ADMIN')
  })

  it('lê role + estado da conta na mesma query', async () => {
    findUnique.mockResolvedValue(userRow() as never)

    await runChain([requireActiveUser], reqWithUser('USER', 42))

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
      select: { isActive: true, suspendedAt: true, role: true },
    })
  })

  it('conta suspensa → 403 ACCOUNT_SUSPENDED', async () => {
    findUnique.mockResolvedValue(userRow({ suspendedAt: new Date() }) as never)

    const { error } = await runChain([requireActiveUser], reqWithUser('ADMIN'))

    expect((error as AppError).statusCode).toBe(403)
    expect((error as AppError).code).toBe('ACCOUNT_SUSPENDED')
  })

  it('conta inactiva → 403 ACCOUNT_SUSPENDED', async () => {
    findUnique.mockResolvedValue(userRow({ isActive: false }) as never)

    const { error } = await runChain([requireActiveUser], reqWithUser('USER'))

    expect((error as AppError).statusCode).toBe(403)
    expect((error as AppError).code).toBe('ACCOUNT_SUSPENDED')
  })

  it('conta apagada → 401 USER_NOT_FOUND', async () => {
    findUnique.mockResolvedValue(null as never)

    const { error } = await runChain([requireActiveUser], reqWithUser('USER'))

    expect((error as AppError).statusCode).toBe(401)
    expect((error as AppError).code).toBe('USER_NOT_FOUND')
  })

  it('sem req.user → 401 (não faz query)', async () => {
    const { error } = await runChain([requireActiveUser], {} as unknown as Request)

    expect((error as AppError).statusCode).toBe(401)
    expect(findUnique).not.toHaveBeenCalled()
  })
})

describe('SEC-09 — requireRole usa o role da BD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('JWT ADMIN + BD USER → 403 (despromoção imediata)', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'USER' }) as never)
    const req = reqWithUser('ADMIN')

    const { error, completed } = await runChain([requireActiveUser, requireRole('ADMIN')], req)

    expect(completed).toBe(false)
    expect((error as AppError).statusCode).toBe(403)
    expect((error as AppError).code).toBe('FORBIDDEN')
  })

  it('JWT e BD ambos ADMIN → passa', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'ADMIN' }) as never)

    const { error, completed } = await runChain(
      [requireActiveUser, requireRole('ADMIN')],
      reqWithUser('ADMIN'),
    )

    expect(error).toBeUndefined()
    expect(completed).toBe(true)
  })

  it('user suspenso continua a 403 mesmo com JWT ADMIN', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'ADMIN', suspendedAt: new Date() }) as never)

    const { error } = await runChain(
      [requireActiveUser, requireRole('ADMIN')],
      reqWithUser('ADMIN'),
    )

    expect((error as AppError).code).toBe('ACCOUNT_SUSPENDED')
  })

  it('fail-closed: sem requireActiveUser antes, requireRole re-lê a BD (JWT ADMIN + BD USER → 403)', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'USER' }) as never)
    const req = reqWithUser('ADMIN')

    const { error } = await runChain([requireRole('ADMIN')], req)

    expect((error as AppError).statusCode).toBe(403)
    expect(findUnique).toHaveBeenCalledTimes(1)
    expect(req.user!.role).toBe('USER')
  })

  it('fail-closed: JWT desactualizado para menos (OWNER) mas BD ADMIN → passa', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'ADMIN' }) as never)

    const { completed } = await runChain([requireRole('ADMIN')], reqWithUser('OWNER'))

    expect(completed).toBe(true)
    expect(findUnique).toHaveBeenCalledTimes(1)
  })

  it('fail-closed: conta suspensa numa rota sem requireActiveUser → 403 ACCOUNT_SUSPENDED', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'ADMIN', suspendedAt: new Date() }) as never)

    const { error } = await runChain([requireRole('ADMIN')], reqWithUser('ADMIN'))

    expect((error as AppError).statusCode).toBe(403)
    expect((error as AppError).code).toBe('ACCOUNT_SUSPENDED')
  })

  it('não repete a query quando o role já foi refrescado nesta request', async () => {
    const req = reqWithUser('ADMIN')

    const { completed } = await runChain(
      [
        (_req, _res, next) => {
          // Simula o efeito de requireActiveUser sem ir à BD.
          ;(_req as Request).roleRefreshedFromDb = true
          next()
        },
        requireRole('ADMIN'),
      ],
      req,
    )

    expect(completed).toBe(true)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('sem req.user → 401 sem query', async () => {
    const { error } = await runChain([requireRole('ADMIN')], {} as unknown as Request)

    expect((error as AppError).statusCode).toBe(401)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('role certo mas não pedido → 403', async () => {
    findUnique.mockResolvedValue(userRow({ role: 'BREEDER' }) as never)

    const { error } = await runChain([requireRole('ADMIN', 'OWNER')], reqWithUser('BREEDER'))

    expect((error as AppError).statusCode).toBe(403)
  })
})
