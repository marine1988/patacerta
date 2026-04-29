// ============================================
// PataCerta — Defaults para useQuery
// ============================================
//
// Helpers partilhados para reduzir tráfego de queries periódicas
// (badges, polling) e centralizar comportamento de refetch.
//
// `pollingQueryDefaults(intervalMs)` devolve as opções a passar a um
// `useQuery` que precise de polling em background. Pausa
// automaticamente o intervalo quando a tab está em segundo plano
// (`document.hidden === true`) — react-query expõe isto via
// `refetchInterval` aceitando `false`.
//
// `STATIC_QUERY_DEFAULTS` aplica-se a queries de catálogos que
// raramente mudam (raças, distritos, categorias) — `staleTime:
// Infinity` evita refetches desnecessários durante a sessão; o backend
// já tem cache TTL 1h em `/breeds` e `/search/districts`.

/**
 * Defaults para queries de polling (badges, contadores). Pausa quando
 * a tab está em background; faz refetch oportunista ao recuperar foco.
 */
export function pollingQueryDefaults(intervalMs: number = 60_000) {
  return {
    refetchInterval: () =>
      typeof document !== 'undefined' && document.hidden ? false : intervalMs,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  } as const
}

/**
 * Defaults para queries de catálogos estáticos (raças, distritos,
 * categorias). Não reflete mudanças em runtime — usar
 * `queryClient.invalidateQueries` se for necessário.
 */
export const STATIC_QUERY_DEFAULTS = {
  staleTime: Infinity,
  gcTime: 24 * 60 * 60 * 1000, // 24h
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const
