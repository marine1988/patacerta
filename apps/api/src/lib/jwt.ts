import jwt, { type SignOptions } from 'jsonwebtoken'

// B-01: Fail fast if secrets are missing — never fall back to known values
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`[PataCerta] Missing required env var: ${name}. Server cannot start without JWT secrets.`)
  }
  return value
}

const JWT_SECRET = process.env.NODE_ENV === 'test' ? 'test-secret' : requireEnv('JWT_SECRET')
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'
const JWT_REFRESH_SECRET = process.env.NODE_ENV === 'test' ? 'test-refresh-secret' : requireEnv('JWT_REFRESH_SECRET')
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d'

export interface TokenPayload {
  userId: number
  email: string
  role: string
}

// I-02: Explicitly restrict algorithm to HS256 to prevent algorithm confusion attacks
const VERIFY_OPTS: jwt.VerifyOptions = { algorithms: ['HS256'] }

export function signAccessToken(payload: TokenPayload): string {
  const opts: SignOptions = { expiresIn: JWT_EXPIRES_IN as string & SignOptions['expiresIn'], algorithm: 'HS256' }
  return jwt.sign(payload, JWT_SECRET, opts)
}

export function signRefreshToken(payload: TokenPayload): string {
  const opts: SignOptions = { expiresIn: JWT_REFRESH_EXPIRES_IN as string & SignOptions['expiresIn'], algorithm: 'HS256' }
  return jwt.sign(payload, JWT_REFRESH_SECRET, opts)
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET, VERIFY_OPTS) as TokenPayload
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET, VERIFY_OPTS) as TokenPayload
}
