/**
 * Constantes partilhadas pelas seeds demo (apps/api/prisma/seed-demo.ts)
 * e pelo seed admin (apps/api/prisma/seed.ts).
 *
 * Manter em sincronia com:
 *  - apps/api/prisma/seed.ts
 *  - apps/api/prisma/seed-demo.ts
 *  - .env.example (ADMIN_EMAIL / ADMIN_PASSWORD)
 */

export const DEMO_PASSWORD = 'DemoPass123'

export const DEMO_BREEDER_EMAILS = [
  'canil.alvalade@example.pt',
  'canil.douro@example.pt',
  'canil.serra@example.pt',
  'canil.algarve@example.pt',
  'criador.minho@example.pt',
  'canil.aveiro@example.pt',
] as const

export const DEMO_CLIENT_EMAILS = [
  'cliente1@example.pt',
  'cliente2@example.pt',
  'cliente3@example.pt',
  'cliente4@example.pt',
] as const

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@patacerta.pt'
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPass123!'

export const API_BASE_URL = process.env.E2E_API_URL || 'http://localhost:3001/api'
