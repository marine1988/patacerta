import jwt, { type SignOptions } from 'jsonwebtoken'
import crypto from 'node:crypto'

const MIN_SECRET_LENGTH = 32

// B-01: Fail fast if secrets are missing — never fall back to known values
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `[PataCerta] Missing required env var: ${name}. Server cannot start without JWT secrets.`,
    )
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[PataCerta] ${name} must be at least ${MIN_SECRET_LENGTH} characters (got ${value.length}). HMAC-SHA256 needs ≥256 bits of entropy to be safe.`,
    )
  }
  return value
}

const JWT_SECRET =
  process.env.NODE_ENV === 'test' ? 'test-secret-for-unit-tests-32chars+' : requireEnv('JWT_SECRET')
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'
const JWT_REFRESH_SECRET =
  process.env.NODE_ENV === 'test'
    ? 'test-refresh-secret-for-tests-32++'
    : requireEnv('JWT_REFRESH_SECRET')
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'

// Defesa em profundidade: rejeitar arranque se access e refresh secrets
// forem identicos. Isto impede que um refresh token seja aceite como
// access token (e vice-versa) por accidente de configuracao.
if (process.env.NODE_ENV !== 'test' && JWT_SECRET === JWT_REFRESH_SECRET) {
  throw new Error(
    '[PataCerta] JWT_SECRET and JWT_REFRESH_SECRET must be different. Token confusion risk.',
  )
}

export interface TokenPayload {
  userId: number
  email: string
  role: string
}

// I-02: Explicitly restrict algorithm to HS256 to prevent algorithm confusion attacks
const VERIFY_OPTS: jwt.VerifyOptions = { algorithms: ['HS256'] }

export function signAccessToken(payload: TokenPayload): string {
  const opts: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as string & SignOptions['expiresIn'],
    algorithm: 'HS256',
    // jti aleatório garante token único mesmo com payload + iat idênticos.
    // Sem isto, dois logins do mesmo user no mesmo segundo geram JWTs
    // bit-a-bit iguais e — para o refresh token — colidem na unique
    // constraint `tokenHash` do RefreshToken (Prisma P2002 → 500).
    jwtid: crypto.randomBytes(16).toString('hex'),
  }
  return jwt.sign(payload, JWT_SECRET, opts)
}

export function signRefreshToken(payload: TokenPayload): string {
  const opts: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRES_IN as string & SignOptions['expiresIn'],
    algorithm: 'HS256',
    // ver comentário em signAccessToken — crítico aqui porque o
    // refresh token é hashado e armazenado com unique constraint.
    jwtid: crypto.randomBytes(16).toString('hex'),
  }
  return jwt.sign(payload, JWT_REFRESH_SECRET, opts)
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET, VERIFY_OPTS) as TokenPayload
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET, VERIFY_OPTS) as TokenPayload
}
