import axios from 'axios'

/**
 * Extrai a mensagem de erro de uma resposta da API com fallback.
 *
 * Procura por esta ordem: `response.data.error` -> `response.data.message`
 * -> `err.message` -> `fallback`. Funciona para qualquer erro (axios ou nao).
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined
    return data?.error ?? data?.message ?? err.message ?? fallback
  }
  return fallback
}
