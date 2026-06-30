/**
 * MaintenancePage - Shown when API returns 503 (maintenance mode)
 */
export function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary-50 to-white px-4 text-center">
      <div className="max-w-md">
        {/* Logo/Icon */}
        <div className="mb-8">
          <span className="text-6xl">🐾</span>
        </div>

        {/* Title */}
        <h1 className="mb-4 text-3xl font-bold text-primary-700">PataCerta em Manutenção</h1>

        {/* Message */}
        <p className="mb-6 text-lg text-muted">
          Estamos a trabalhar para melhorar a sua experiência. Voltamos em breve!
        </p>

        {/* Illustration */}
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg">
          <div className="flex items-center justify-center gap-4 text-4xl">
            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
              🔧
            </span>
            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
              🐕
            </span>
            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
              💻
            </span>
          </div>
        </div>

        {/* Info */}
        <p className="text-sm text-muted">
          Enquanto espera, pode seguir-nos nas redes sociais para novidades.
        </p>

        {/* Retry button */}
        <button
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-white transition-colors hover:bg-primary-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Tentar novamente
        </button>
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-muted/60">© 2026 PataCerta — Todos os direitos reservados</p>
    </div>
  )
}
