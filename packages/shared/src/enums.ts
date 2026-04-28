// ============================================
// PataCerta — Shared Enums
// ============================================

export enum UserRole {
  OWNER = 'OWNER',
  BREEDER = 'BREEDER',
  SERVICE_PROVIDER = 'SERVICE_PROVIDER',
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
  DGAV = 'DGAV',
}

export enum ServiceStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED = 'SUSPENDED',
}

export enum PriceUnit {
  FIXED = 'FIXED',
  HOURLY = 'HOURLY',
  PER_SESSION = 'PER_SESSION',
}

export enum ServiceReportStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  DISMISSED = 'DISMISSED',
}
