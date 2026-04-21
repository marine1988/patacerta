import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="flex items-center gap-2 text-lg font-bold text-primary-600">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 18c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm-4.5-8a2 2 0 100-4 2 2 0 000 4zm9 0a2 2 0 100-4 2 2 0 000 4zM5 13a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
              PataCerta
            </Link>
            <p className="mt-3 text-sm text-gray-500">
              A plataforma de referência para criadores verificados em Portugal.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Plataforma</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/diretorio" className="text-sm text-gray-500 hover:text-gray-700">
                  Diretório de Criadores
                </Link>
              </li>
              <li>
                <Link to="/registar" className="text-sm text-gray-500 hover:text-gray-700">
                  Registar como Criador
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Legal</h4>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/politica-privacidade" className="text-sm text-gray-500 hover:text-gray-700">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link to="/termos" className="text-sm text-gray-500 hover:text-gray-700">
                  Termos de Utilização
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Contacto</h4>
            <ul className="mt-3 space-y-2">
              <li className="text-sm text-gray-500">info@patacerta.pt</li>
              <li className="text-sm text-gray-500">Lisboa, Portugal</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-100 pt-6">
          <p className="text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} PataCerta. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
