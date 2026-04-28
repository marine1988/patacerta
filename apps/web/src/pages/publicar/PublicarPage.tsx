import { Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'

/**
 * Publicar — landing onde o utilizador escolhe o tipo de anuncio.
 *
 * Toda a gente comeca como OWNER no registo. Aqui ramifica-se em duas
 * vias:
 *  - "Criador": cria perfil de criador (auto-promove para BREEDER no
 *    servidor).
 *  - "Servico": cria um anuncio de servico via painel (auto-promove para
 *    SERVICE_PROVIDER).
 *
 * Um mesmo utilizador pode ter as duas coisas em simultaneo. As
 * permissoes derivam do que ele tem (perfil/servicos), nao do role.
 */
export function PublicarPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Publicar um anúncio</h1>
        <p className="mt-2 text-sm text-gray-600">
          Escolha o tipo de anúncio que pretende criar. Pode ter ambos na mesma conta.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link to="/publicar/criador" className="block focus:outline-none">
          <Card className="h-full transition hover:border-caramel-500 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-caramel-100 text-caramel-700">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Anúncio de criador</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Tem um canil e cria cães. Vai precisar de NIF e número DGAV.
                </p>
                <p className="mt-3 text-xs font-medium text-caramel-700">
                  Criar perfil de criador →
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/publicar/servico" className="block focus:outline-none">
          <Card className="h-full transition hover:border-caramel-500 hover:shadow-md">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Anúncio de serviço</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Presta serviços a animais (banhos, treino, passeios, hospedagem…). Indique
                  categoria, preço e zona de cobertura.
                </p>
                <p className="mt-3 text-xs font-medium text-blue-700">Criar anúncio de serviço →</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  )
}
