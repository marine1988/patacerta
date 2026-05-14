import axios from 'axios'

// ----------------------------------------------------------------------------
// Tipos do payload de erro da API
// ----------------------------------------------------------------------------
//
// A API normaliza erros de duas formas (ver apps/api/src/middleware/
// error-handler.ts):
//
//   AppError(status, message, code?):   { error: string, code?: string }
//   ZodError (VALIDATION_ERROR):        { error: 'Dados inválidos', code: 'VALIDATION_ERROR',
//                                          details: [{ path, message, code? }] }
//   Catch-all (500):                    { error: 'Internal Server Error' }
//
// Algumas rotas legacy ou middlewares 3os respondem com `{ message: '...' }` em
// vez de `{ error: '...' }`. Tratamos ambos.

export interface ApiErrorPayload {
  error?: string
  message?: string
  code?: string
  details?: Array<{
    path?: Array<string | number>
    message?: string
    code?: string
  }>
}

export interface ApiErrorInfo {
  /** Mensagem human-readable pronta a mostrar (com fallback aplicado). */
  message: string
  /** AppError.code se vier (e.g. 'EMAIL_NOT_VERIFIED', 'VALIDATION_ERROR'). */
  code: string | null
  /** HTTP status da resposta, ou null se nao foi axios/sem resposta. */
  status: number | null
  /** Issues do ZodError formatadas (so' presentes quando code === 'VALIDATION_ERROR'). */
  details: ApiErrorPayload['details']
  /** True se o erro veio de um cancel (abort) — caller deve ignorar. */
  canceled: boolean
}

// ----------------------------------------------------------------------------
// Helper principal
// ----------------------------------------------------------------------------

/**
 * Extrai informacao estruturada de um erro de chamada a API.
 *
 * Procura por esta ordem para a mensagem: `response.data.error` ->
 * `response.data.message` -> `err.message` -> `fallback`. Funciona para
 * qualquer erro (axios ou nao).
 *
 * Casos especiais:
 *  - VALIDATION_ERROR: usa o primeiro `details[].message` se disponivel (em vez
 *    de "Dados inválidos"), porque a mensagem generica e' inutil para o user.
 *  - canceled === true (abort de fetch/axios cancel): o caller deve normalmente
 *    fazer `if (info.canceled) return` para nao mostrar nada.
 *  - Erros de rede (sem response): devolve fallback + status null.
 */
export function extractApiErrorInfo(err: unknown, fallback: string): ApiErrorInfo {
  if (axios.isCancel(err)) {
    return { message: fallback, code: null, status: null, details: undefined, canceled: true }
  }

  if (axios.isAxiosError(err)) {
    const data = (err.response?.data ?? {}) as ApiErrorPayload
    const code = typeof data.code === 'string' ? data.code : null

    // Para erros de validacao, a primeira issue concreta e' sempre mais util
    // que "Dados inválidos". O caller pode aceder a `details` para listar
    // todas as issues se quiser.
    let message: string
    if (code === 'VALIDATION_ERROR' && Array.isArray(data.details) && data.details.length > 0) {
      const first = data.details[0]
      message = first?.message ?? data.error ?? data.message ?? err.message ?? fallback
    } else {
      message = data.error ?? data.message ?? err.message ?? fallback
    }

    return {
      message,
      code,
      status: err.response?.status ?? null,
      details: Array.isArray(data.details) ? data.details : undefined,
      canceled: false,
    }
  }

  if (err instanceof Error) {
    return {
      message: err.message || fallback,
      code: null,
      status: null,
      details: undefined,
      canceled: false,
    }
  }

  return { message: fallback, code: null, status: null, details: undefined, canceled: false }
}

/**
 * Versao concisa que so' devolve a mensagem. Mantida para retrocompatibilidade
 * com os consumidores ja' migrados. Internamente delega a extractApiErrorInfo.
 */
export function extractApiError(err: unknown, fallback: string): string {
  return extractApiErrorInfo(err, fallback).message
}

// ----------------------------------------------------------------------------
// Formatacao de validacao
// ----------------------------------------------------------------------------

/**
 * Formata as issues de um ZodError no formato `campo: mensagem` (uma por
 * linha). Util para mostrar todas as issues num <ul> ou num bloco multi-line
 * abaixo do form. Devolve [] se nao houver details.
 *
 * Exemplo de output:
 *   ["email: Email inválido", "password: Deve ter pelo menos 8 caracteres"]
 */
export function formatValidationDetails(details: ApiErrorPayload['details']): string[] {
  if (!Array.isArray(details) || details.length === 0) return []
  return details.map((d) => {
    const path = Array.isArray(d.path) && d.path.length > 0 ? d.path.join('.') : null
    const msg = d.message ?? 'Valor inválido'
    return path ? `${path}: ${msg}` : msg
  })
}
