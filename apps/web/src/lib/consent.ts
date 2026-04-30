// ============================================
// PataCerta — Consent Management Platform (CMP)
// ============================================
//
// Estado de consentimento de cookies/categorias armazenado em
// localStorage e sincronizado com o backend para audit trail RGPD.
//
// Estrategia:
//  - 3 categorias: necessary (sempre true), analytics, marketing
//  - Estado pre-consent: tudo opt-out (CNPD strict)
//  - Decisao persiste com versao da politica; se a versao mudar,
//    re-pedimos consentimento (decision passa a null)
//  - Cada decisao envia POST /api/consent/cookies para audit trail
//  - Google Consent Mode v2 e' inicializado em modo 'denied' antes
//    de qualquer script de marketing/analytics carregar

import { api } from './api'

/**
 * Versao da politica de cookies. Tem de bater certo com
 * COOKIE_CONSENT_VERSION no backend (consent.controller.ts).
 * Incrementar quando categorias mudarem.
 */
export const COOKIE_CONSENT_VERSION = '2026-04-30'

const STORAGE_KEY = 'pc_consent_v1'

export interface ConsentDecision {
  necessary: true
  analytics: boolean
  marketing: boolean
}

export interface ConsentState {
  anonId: string
  decision: ConsentDecision | null
  version: string
  decidedAt: string | null
}

interface StoredConsent {
  anonId: string
  decision: ConsentDecision | null
  version: string
  decidedAt: string | null
}

/**
 * Gera UUID v4. Usa crypto.randomUUID quando disponivel (browsers
 * modernos + HTTPS), com fallback para uma implementacao manual.
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback minimal RFC4122 v4 (suficiente para anonId, nao critico).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function readStored(): StoredConsent | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredConsent>
    if (typeof parsed.anonId !== 'string' || typeof parsed.version !== 'string') return null
    return {
      anonId: parsed.anonId,
      decision: (parsed.decision as ConsentDecision | null) ?? null,
      version: parsed.version,
      decidedAt: parsed.decidedAt ?? null,
    }
  } catch {
    return null
  }
}

function writeStored(state: StoredConsent): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/**
 * Le o estado actual. Cria anonId se ainda nao existir. Se a versao
 * armazenada nao corresponder a actual, descarta a decisao (forca
 * re-consent) mas preserva o anonId.
 */
export function getConsent(): ConsentState {
  const stored = readStored()
  if (!stored) {
    const fresh: StoredConsent = {
      anonId: generateUuid(),
      decision: null,
      version: COOKIE_CONSENT_VERSION,
      decidedAt: null,
    }
    writeStored(fresh)
    return fresh
  }
  if (stored.version !== COOKIE_CONSENT_VERSION) {
    // Re-pedir consentimento. Mantem anonId (ja' existe historico).
    const updated: StoredConsent = {
      anonId: stored.anonId,
      decision: null,
      version: COOKIE_CONSENT_VERSION,
      decidedAt: null,
    }
    writeStored(updated)
    return updated
  }
  return stored
}

/**
 * `true` quando ainda nao foi tomada decisao na versao actual.
 * Usado pelo banner para decidir se renderiza.
 */
export function needsDecision(): boolean {
  return getConsent().decision === null
}

/**
 * Persiste decisao localmente, actualiza Google Consent Mode v2 e
 * envia para o backend para audit trail. Erros de rede no audit
 * trail nao bloqueiam a UI (best-effort).
 */
export async function saveConsent(decision: ConsentDecision): Promise<void> {
  const current = getConsent()
  const next: StoredConsent = {
    anonId: current.anonId,
    decision,
    version: COOKIE_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  }
  writeStored(next)
  applyConsentMode(decision)
  notifyListeners()

  // Audit trail (best-effort)
  try {
    await api.post('/consent/cookies', {
      anonId: next.anonId,
      decision,
    })
  } catch {
    // Sem rede ou backoff — perdemos so o audit, nao a UX.
  }
}

/**
 * Aceita todas as categorias.
 */
export function acceptAll(): Promise<void> {
  return saveConsent({ necessary: true, analytics: true, marketing: true })
}

/**
 * Rejeita todas as opcionais (necessary fica sempre).
 */
export function rejectOptional(): Promise<void> {
  return saveConsent({ necessary: true, analytics: false, marketing: false })
}

// ─────────────────────────────────────────────────────────────────
// Google Consent Mode v2
// ─────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Inicializa Google Consent Mode v2 com defaults 'denied'. Tem de
 * ser chamado o mais cedo possivel (antes de scripts AdSense/GA
 * carregarem). Idempotente.
 */
export function initConsentMode(): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  // gtag stub que enfileira em dataLayer (compat com gtag.js).
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window.dataLayer as unknown[]).push(args as any)
    }
  }
  // Defaults strict — RGPD/CNPD recommended.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500,
  })
  // Re-aplicar a decisao actual (se existir) — caso o user ja tenha decidido
  // numa visita anterior, queremos sinalizar isso ao GCM imediatamente.
  const state = getConsent()
  if (state.decision) {
    applyConsentMode(state.decision)
  }
}

function applyConsentMode(decision: ConsentDecision): void {
  if (typeof window === 'undefined' || !window.gtag) return
  window.gtag('consent', 'update', {
    ad_storage: decision.marketing ? 'granted' : 'denied',
    ad_user_data: decision.marketing ? 'granted' : 'denied',
    ad_personalization: decision.marketing ? 'granted' : 'denied',
    analytics_storage: decision.analytics ? 'granted' : 'denied',
  })
}

// ─────────────────────────────────────────────────────────────────
// Subscriptions — para componentes reagirem a mudancas (ex.: AdSlot
// re-render quando o user aceita marketing).
// ─────────────────────────────────────────────────────────────────

type Listener = (state: ConsentState) => void
const listeners = new Set<Listener>()

export function subscribe(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyListeners(): void {
  const state = getConsent()
  listeners.forEach((fn) => {
    try {
      fn(state)
    } catch {
      // listener roto nao pode rebentar a chain
    }
  })
}

/**
 * Helper para outros modulos saberem se podem servir personalizacao.
 */
export function hasMarketingConsent(): boolean {
  return getConsent().decision?.marketing === true
}

export function hasAnalyticsConsent(): boolean {
  return getConsent().decision?.analytics === true
}
