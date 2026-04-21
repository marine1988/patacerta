import type { Request, Response, NextFunction } from 'express'
import type { ZodSchema } from 'zod'

type RequestField = 'body' | 'query' | 'params'

/**
 * Express middleware that validates req[field] against a Zod schema.
 * Replaces req[field] with the parsed/coerced result.
 */
export function validate(schema: ZodSchema, field: RequestField = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[field])
    if (!result.success) {
      next(result.error)
      return
    }
    ;(req as unknown as Record<string, unknown>)[field] = result.data
    next()
  }
}
