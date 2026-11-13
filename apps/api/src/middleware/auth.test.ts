/**
 * PATA-BUG-12 — o access token tem de viajar num header dedicado.
 *
 * Em stage o host está atrás do basic auth do Traefik, que ocupa o header
 * `Authorization`. Quando o JWT ia em `Authorization: Bearer`, o Traefik
 * interpretava-o como credencial de basic auth e respondia 401 antes de o
 * pedido chegar à API. Estes testes fixam o contrato:
 *
 *   - `X-Access-Token` é a via principal;
 *   - `Authorization: Bearer` continua aceite (retrocompatibilidade);
 *   - quando ambos vêm, o dedicado ganha (não há ambiguidade);
 *   - sem nenhum, `requireAuth` responde 401 e `optionalAuth` segue anónimo.
 */

import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { ACCESS_TOKEN_HEADER, extractAccessToken, requireAuth, optionalAuth } from './auth.js'
import { signAccessToken, type TokenPayload } from '../lib/jwt.js'
import { AppError } from './error-handler.js'

const payload: TokenPayload = { userId: 7, email: 'demo@example.com', role: 'CLIENT' }

function reqWith(headers: Record<string, string>): Request {
  return { headers } as unknown as Request
}

function run(mw: (req: Request, res: Response, next: NextFunction) => void, req: Request) {
  const next = vi.fn()
  mw(req, {} as Response, next as unknown as NextFunction)
  return next
}

describe('extractAccessToken', () => {
  it('lê o header dedicado', () => {
    expect(extractAccessToken(reqWith({ [ACCESS_TOKEN_HEADER]: 'abc123' }))).toBe('abc123')
  })

  it('aceita Authorization: Bearer como fallback', () => {
    expect(extractAccessToken(reqWith({ authorization: 'Bearer abc123' }))).toBe('abc123')
  })

  it('dá prioridade ao header dedicado quando ambos vêm', () => {
    const req = reqWith({
      [ACCESS_TOKEN_HEADER]: 'dedicado',
      authorization: 'Bearer legado',
    })
    expect(extractAccessToken(req)).toBe('dedicado')
  })

  it('descarta espaços à volta do header dedicado', () => {
    expect(extractAccessToken(reqWith({ [ACCESS_TOKEN_HEADER]: '  abc  ' }))).toBe('abc')
  })

  it('ignora header dedicado vazio e cai para o Bearer', () => {
    const req = reqWith({ [ACCESS_TOKEN_HEADER]: '   ', authorization: 'Bearer legado' })
    expect(extractAccessToken(req)).toBe('legado')
  })

  it('devolve null sem headers de autenticação', () => {
    expect(extractAccessToken(reqWith({}))).toBeNull()
  })

  it('devolve null com Authorization que não é Bearer', () => {
    expect(extractAccessToken(reqWith({ authorization: 'Basic dXNlcjpwYXNz' }))).toBeNull()
  })
})

describe('requireAuth com header dedicado', () => {
  it('autentica com X-Access-Token', () => {
    const token = signAccessToken(payload)
    const req = reqWith({ [ACCESS_TOKEN_HEADER]: token })
    const next = run(requireAuth, req)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user?.userId).toBe(payload.userId)
    expect(req.user?.role).toBe(payload.role)
  })

  it('continua a autenticar com Authorization: Bearer', () => {
    const token = signAccessToken(payload)
    const req = reqWith({ authorization: `Bearer ${token}` })
    const next = run(requireAuth, req)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user?.email).toBe(payload.email)
  })

  it('rejeita com 401 quando não há token', () => {
    expect(() => run(requireAuth, reqWith({}))).toThrowError(AppError)
    try {
      run(requireAuth, reqWith({}))
    } catch (err) {
      const appErr = err as AppError
      expect(appErr.statusCode).toBe(401)
      expect(appErr.code).toBe('UNAUTHORIZED')
    }
  })

  it('rejeita com 401 quando o token é inválido', () => {
    try {
      run(requireAuth, reqWith({ [ACCESS_TOKEN_HEADER]: 'nao-e-um-jwt' }))
      throw new Error('devia ter lançado')
    } catch (err) {
      const appErr = err as AppError
      expect(appErr.statusCode).toBe(401)
      expect(appErr.code).toBe('INVALID_TOKEN')
    }
  })
})

describe('optionalAuth com header dedicado', () => {
  it('anexa o utilizador com token válido', () => {
    const token = signAccessToken(payload)
    const req = reqWith({ [ACCESS_TOKEN_HEADER]: token })
    const next = run(optionalAuth, req)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user?.userId).toBe(payload.userId)
  })

  it('segue anónimo sem token', () => {
    const req = reqWith({})
    const next = run(optionalAuth, req)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toBeUndefined()
  })

  it('segue anónimo com token inválido, sem lançar', () => {
    const req = reqWith({ [ACCESS_TOKEN_HEADER]: 'lixo' })
    const next = run(optionalAuth, req)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toBeUndefined()
  })
})
