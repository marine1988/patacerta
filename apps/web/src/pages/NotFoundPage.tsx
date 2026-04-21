import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-primary-600">404</p>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Página não encontrada</h1>
        <p className="mt-2 text-gray-600">A página que procura não existe ou foi removida.</p>
        <Link to="/" className="btn-primary mt-6 inline-block">
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
