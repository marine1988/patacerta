import type { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    })
    return
  }

  // Known application errors
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code || 'APP_ERROR',
    })
    return
  }

  // Erros de parsing do body (ex.: body-parser 'entity.parse.failed' com JSON
  // malformado) ou outros erros "expose" que ja' trazem um statusCode de
  // cliente. Devolvemos o codigo correto (400 tipicamente) em vez de 500 e
  // evitamos poluir os logs com stack traces de pedidos invalidos do cliente.
  const clientErr = err as {
    statusCode?: number
    status?: number
    type?: string
    expose?: boolean
  }
  const clientStatus = clientErr.statusCode ?? clientErr.status
  const isParseError = clientErr.type === 'entity.parse.failed'
  const isExposedClientError =
    clientErr.expose === true &&
    clientStatus !== undefined &&
    clientStatus >= 400 &&
    clientStatus < 500
  if (isParseError || isExposedClientError) {
    res.status(clientStatus ?? 400).json({
      error: 'Pedido inválido',
      code: 'BAD_REQUEST',
    })
    return
  }

  // Rejeicao CORS: devolve 403 sem log de stack (evita info disclosure / DoS
  // por spam de origins invalidos). Detecta tanto AppError com code
  // CORS_BLOCKED como erros genericos cuja mensagem mencione CORS.
  const isCorsError =
    (err as { code?: string }).code === 'CORS_BLOCKED' || /cors/i.test(err.message || '')
  if (isCorsError) {
    res.status(403).json({
      error: 'Origem não autorizada',
      code: 'CORS_BLOCKED',
    })
    return
  }

  // Unknown errors
  console.error('[Unhandled Error]', err)
  res.status(500).json({
    error: 'Erro interno do servidor',
    code: 'INTERNAL_ERROR',
  })
}
