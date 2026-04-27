// ============================================
// PataCerta — Shared Constants
// ============================================

/**
 * Version of the Terms of Service / Privacy Policy currently in force.
 * Bump (ISO date) whenever legal text changes; ConsentLog rows record the
 * version the user accepted so we can prove specific consent.
 */
export const TERMS_VERSION = '2026-01-01'

/**
 * Consent types stored in `consent_logs.consent_type`.
 * Format: `<TYPE>:<version>` so we can prove user accepted a specific text.
 */
export const CONSENT_TYPE = {
  TERMS: 'TERMS',
  PRIVACY: 'PRIVACY',
} as const

export type ConsentType = (typeof CONSENT_TYPE)[keyof typeof CONSENT_TYPE]
