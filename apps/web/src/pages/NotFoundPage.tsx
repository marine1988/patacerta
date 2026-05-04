import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'

export function NotFoundPage() {
  usePageMeta({
    title: 'Página não encontrada',
    description: 'A página que procura não existe ou foi removida.',
    noIndex: true,
  })

  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-caramel-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-ink">Página não encontrada</h1>
        <p className="mt-2 text-muted">A página que procura não existe ou foi removida.</p>
        <Link to="/" className="btn-primary mt-6 inline-block">
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
