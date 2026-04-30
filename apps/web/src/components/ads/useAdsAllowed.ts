// ============================================
// PataCerta — Hook useAdsAllowed
// ============================================
//
// Determina se o `pathname` actual permite renderizar slots AdSense.
// Áreas sensíveis (auth, dashboard pessoal, admin, mensagens, fluxo
// de publicação) são excluídas por boas práticas e por respeito à
// política AdSense de não servir ads em páginas privadas/transaccionais.

const EXCLUDED_PREFIXES = [
  '/entrar',
  '/registar',
  '/recuperar-palavra-passe',
  '/redefinir-palavra-passe',
  '/verificar-email',
  '/area-pessoal',
  '/admin',
  '/mensagens',
  '/publicar',
  '/criador-onboarding',
  '/avaliar', // fluxo de submissão de review
]

export function useAdsAllowed(pathname: string): boolean {
  if (!pathname) return false
  return !EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}
