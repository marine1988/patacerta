// ============================================
// PataCerta — Shared Enums
// ============================================

export enum UserRole {
  OWNER = 'OWNER',
  BREEDER = 'BREEDER',
  ADMIN = 'ADMIN',
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum BreederStatus {
  DRAFT = 'DRAFT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  SUSPENDED = 'SUSPENDED',
}

export enum DocType {
  NIF = 'NIF',
  DGAV = 'DGAV',
  CARTAO_CIDADAO = 'CARTAO_CIDADAO',
  CITES = 'CITES',
  OTHER = 'OTHER',
}
