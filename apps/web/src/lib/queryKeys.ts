// ============================================
// PataCerta — Query keys centralizadas
// ============================================
//
// Reúne as queryKeys usadas pelos hooks/componentes para garantir
// consistência entre fetches e invalidações. Evita ter strings soltas
// e divergências (`['admin', 'pending-counts']` vs
// `['admin-pending-counts']`).
//
// As keys são funções que devolvem tuplos `as const` para o react-query
// derivar o tipo correctamente. Quando precisares de invalidar uma
// família inteira (ex.: todas as queries de `breeder`), usa o prefixo
// (`queryClient.invalidateQueries({ queryKey: queryKeys.breeder.all() })`).

export const queryKeys = {
  // ── Catálogos estáticos (cache longo via STATIC_QUERY_DEFAULTS) ────
  breeds: () => ['breeds'] as const,
  districts: () => ['districts'] as const,
  municipalities: (districtId: number | string | null | undefined) =>
    ['municipalities', districtId ?? null] as const,
  serviceCategories: () => ['service-categories'] as const,
  species: () => ['species'] as const,

  // ── Mensagens / Threads ───────────────────────────────────────────
  messages: {
    unreadCount: () => ['messages', 'unread-count'] as const,
    threads: (filter: 'active' | 'archived' = 'active') => ['threads', filter] as const,
    thread: (threadId: number | string | null | undefined) => ['thread', threadId ?? null] as const,
    search: (query: string) => ['messages', 'search', query] as const,
  },

  // ── Admin ─────────────────────────────────────────────────────────
  admin: {
    all: () => ['admin'] as const,
    pendingCounts: () => ['admin', 'pending-counts'] as const,
    stats: () => ['admin-stats'] as const,
    verifications: (page: number) => ['admin-verifications', page] as const,
    users: (page: number, role?: string) => ['admin-users', page, role ?? null] as const,
    breeders: (page: number, status?: string) => ['admin-breeders', page, status ?? null] as const,
    flaggedReviews: (page: number, type: 'all' | 'breeder' | 'service') =>
      ['admin-flagged-reviews', page, type] as const,
    messageReports: (page: number, status: string) =>
      ['admin-message-reports', page, status] as const,
    messageReport: (id: number | string | null | undefined) =>
      ['admin-message-report', id ?? null] as const,
    serviceReports: (page: number, status: string) =>
      ['admin-service-reports', page, status] as const,
    services: (page: number, status: string, q: string) =>
      ['admin-services', page, status, q] as const,
    auditLogs: (page: number, action?: string, entity?: string) =>
      ['admin-audit-logs', page, action ?? null, entity ?? null] as const,
    reviewFlags: (type: string | null, id: number | string | null | undefined) =>
      ['review-flags', type, id ?? null] as const,
  },

  // ── Breeders ──────────────────────────────────────────────────────
  breeder: {
    all: () => ['breeder'] as const,
    byId: (id: number | string | null | undefined) => ['breeder', id ?? null] as const,
    profile: () => ['breeder-profile'] as const,
    profileProbe: (userId: number | string | null | undefined) =>
      ['breeder-profile-probe', userId ?? null] as const,
  },

  // ── Reviews ───────────────────────────────────────────────────────
  reviews: {
    all: () => ['reviews'] as const,
    byBreeder: (breederId: number | string | null | undefined, sort?: string, page?: number) =>
      ['reviews', { breederId: breederId ?? null, sort, page }] as const,
    eligibility: (breederId: number | string | null | undefined) =>
      ['review-eligibility', { breederId: breederId ?? null }] as const,
    mine: () => ['my-reviews'] as const,
  },

  // ── Services ──────────────────────────────────────────────────────
  services: {
    mine: () => ['services', 'mine'] as const,
    mineProbe: (userId: number | string | null | undefined) =>
      ['my-services-probe', userId ?? null] as const,
  },

  // ── Home ──────────────────────────────────────────────────────────
  home: {
    featured: () => ['home-featured'] as const,
  },
} as const
