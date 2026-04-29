/**
 * Tipos e helpers partilhados entre os separadores do painel admin.
 *
 * Mantemos em `_shared` (prefixo `_`) para sinalizar que sao internos
 * ao folder `pages/admin/` — nao sao componentes reutilizaveis em
 * outras pages.
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface AdminStats {
  users: { total: number }
  breeders: { total: number; verified: number }
  verifications: { pending: number }
  reviews: { total: number; flagged: number }
  messages: { total: number }
}

export interface VerificationDoc {
  id: number
  docType: string
  fileName: string
  status: string
  createdAt: string
  breeder: {
    id: number
    businessName: string
    nif: string
    status: string
    user: { id: number; firstName: string; lastName: string; email: string }
  }
}

export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  role: string
  createdAt: string
  breeder: { id: number; status: string } | null
}

export interface Breeder {
  id: number
  businessName: string
  nif: string
  dgavNumber: string
  status: string
  createdAt: string
  featuredUntil: string | null
  user: { id: number; firstName: string; lastName: string; email: string }
  district: { namePt: string } | null
  _count: { verificationDocs: number; reviews: number }
}

export interface Review {
  id: number
  rating: number
  title: string
  body: string
  status: string
  createdAt: string
  author: { id: number; firstName: string; lastName: string; email: string }
  breeder?: { id: number; businessName: string }
  service?: { id: number; title: string }
  type?: 'breeder' | 'service'
}

export interface AuditLog {
  id: number
  userId: number | null
  action: string
  entity: string
  entityId: string | number | null
  details: unknown
  ipAddress: string | null
  createdAt: string
  user: { id: number; firstName: string; lastName: string; email: string } | null
}

// ─────────────────────────────────────────────────────────────────────
// Badge variants e labels (PT-PT)
// ─────────────────────────────────────────────────────────────────────

export const statusBadgeVariant: Record<string, 'green' | 'yellow' | 'red' | 'gray' | 'blue'> = {
  VERIFIED: 'green',
  PUBLISHED: 'green',
  PENDING: 'yellow',
  PENDING_VERIFICATION: 'yellow',
  SUSPENDED: 'red',
  FLAGGED: 'red',
  DRAFT: 'gray',
  HIDDEN: 'gray',
}

export const roleBadgeVariant: Record<string, 'green' | 'blue' | 'gray'> = {
  ADMIN: 'blue',
  BREEDER: 'green',
  OWNER: 'gray',
}

export const statusLabel: Record<string, string> = {
  VERIFIED: 'Verificado',
  PUBLISHED: 'Publicada',
  PENDING: 'Pendente',
  PENDING_VERIFICATION: 'Pendente de verificação',
  SUSPENDED: 'Suspenso',
  FLAGGED: 'Sinalizada',
  DRAFT: 'Rascunho',
  HIDDEN: 'Oculta',
}

export const roleLabel: Record<string, string> = {
  ADMIN: 'Administrador',
  BREEDER: 'Criador',
  OWNER: 'Utilizador',
}
