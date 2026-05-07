import { describe, it, expect } from 'vitest'
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type TokenPayload,
} from './jwt.js'

const payload: TokenPayload = {
  userId: 1,
  email: 'demo@example.com',
  role: 'CLIENT',
}

describe('JWT — assinatura', () => {
  it('signAccessToken devolve token com 3 segmentos', () => {
    const token = signAccessToken(payload)
    expect(token.split('.')).toHaveLength(3)
  })

  it('verifyAccessToken devolve payload original', () => {
    const token = signAccessToken(payload)
    const decoded = verifyAccessToken(token)
    expect(decoded.userId).toBe(payload.userId)
    expect(decoded.email).toBe(payload.email)
    expect(decoded.role).toBe(payload.role)
  })

  // Regressão: dois logins do mesmo user no mesmo segundo geravam JWTs
  // bit-a-bit iguais (payload + iat idênticos) e o refresh token colidia
  // na unique constraint `tokenHash` do Prisma → 500 INTERNAL_ERROR.
  // O jti aleatório em SignOptions resolve a colisão garantindo unicidade.
  it('signAccessToken produz tokens diferentes em invocações consecutivas', () => {
    const a = signAccessToken(payload)
    const b = signAccessToken(payload)
    expect(a).not.toBe(b)
  })

  it('signRefreshToken produz tokens diferentes em invocações consecutivas', () => {
    const a = signRefreshToken(payload)
    const b = signRefreshToken(payload)
    expect(a).not.toBe(b)
  })

  it('verifyRefreshToken devolve payload original', () => {
    const token = signRefreshToken(payload)
    const decoded = verifyRefreshToken(token)
    expect(decoded.userId).toBe(payload.userId)
  })
})
