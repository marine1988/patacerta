import type { Request, Response, NextFunction } from 'express'
import { AppError } from '../middleware/error-handler.js'
import { prisma } from './prisma.js'

// ── asyncHandler ─────────────────────────────────────────────────────
// Wraps async route handlers so thrown errors are always passed to next()
// Eliminates the try/catch/next(err) boilerplate from every controller.

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<void>

export const asyncHandler =
  (fn: AsyncFn) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next)
  }

// ── parseId ──────────────────────────────────────────────────────────
// Parses a route param as a positive integer. Throws 400 if invalid.

export function parseId(raw: string): number {
  const id = parseInt(raw, 10)
  if (isNaN(id) || id <= 0) throw new AppError(400, 'ID inválido', 'INVALID_ID')
  return id
}

// ── parsePagination ──────────────────────────────────────────────────
// Extracts page/limit from query string with safe defaults and caps.

export function parsePagination(query: Record<string, unknown>, maxLimit = 50) {
  const page = Math.max(parseInt(String(query.page)) || 1, 1)
  const limit = Math.min(Math.max(parseInt(String(query.limit)) || 20, 1), maxLimit)
  return { page, limit, skip: (page - 1) * limit }
}

// ── paginatedResponse ────────────────────────────────────────────────
// Standard envelope for paginated list endpoints.

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

// ── getBreederForUser ────────────────────────────────────────────────
// Loads the breeder profile for a given userId. Throws 404 if not found.
// Used in breeders, verification, and messages controllers.

export async function getBreederForUser(userId: number) {
  const breeder = await prisma.breeder.findUnique({ where: { userId } })
  if (!breeder) throw new AppError(404, 'Perfil de criador não encontrado', 'BREEDER_NOT_FOUND')
  return breeder
}
