import { useSearchParams, Link } from 'react-router-dom'
import { BreedersListView } from './BreedersListView'
import { ServicesListView } from './ServicesListView'
import { BreedersMapView } from './BreedersMapView'
import { ServicesMapView } from './ServicesMapView'

type PesquisarTipo = 'criadores' | 'servicos'
type PesquisarVista = 'lista' | 'mapa'

export function PesquisarPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const tipo: PesquisarTipo = searchParams.get('tipo') === 'servicos' ? 'servicos' : 'criadores'
  const vista: PesquisarVista = searchParams.get('vista') === 'mapa' ? 'mapa' : 'lista'

  function setTipo(next: PesquisarTipo) {
    const params = new URLSearchParams(searchParams)
    if (next === 'criadores') params.delete('tipo')
    else params.set('tipo', next)
    // Reset paginação e filtros específicos do outro tipo
    params.delete('page')
    if (next === 'servicos') {
      params.delete('speciesId')
    } else {
      params.delete('categoryId')
      params.delete('priceMin')
      params.delete('priceMax')
      params.delete('municipalityId')
      params.delete('sort')
      params.delete('radiusKm')
    }
    setSearchParams(params)
  }

  function setVista(next: PesquisarVista) {
    const params = new URLSearchParams(searchParams)
    if (next === 'lista') params.delete('vista')
    else params.set('vista', next)
    // Reset paginação ao mudar de vista (mapa não pagina)
    params.delete('page')
    setSearchParams(params)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Pesquisar</h1>
        <p className="page-subtitle">
          Encontre criadores verificados e prestadores de serviços em Portugal.
        </p>
      </div>

      {/* Barra de controlos: tipo (esquerda) + vista (direita) */}
      <div className="mt-4 flex flex-col gap-3 border-b border-gray-200 sm:flex-row sm:items-end sm:justify-between">
        <nav className="-mb-px flex gap-6" aria-label="Tipo">
          <button
            type="button"
            onClick={() => setTipo('criadores')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              tipo === 'criadores'
                ? 'border-caramel-600 text-caramel-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
            aria-current={tipo === 'criadores' ? 'page' : undefined}
          >
            Criadores
          </button>
          <button
            type="button"
            onClick={() => setTipo('servicos')}
            className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              tipo === 'servicos'
                ? 'border-caramel-600 text-caramel-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
            aria-current={tipo === 'servicos' ? 'page' : undefined}
          >
            Serviços
          </button>
        </nav>

        <div
          className="mb-2 inline-flex rounded-lg border border-gray-200 bg-white p-0.5"
          role="tablist"
          aria-label="Vista"
        >
          <button
            type="button"
            onClick={() => setVista('lista')}
            role="tab"
            aria-selected={vista === 'lista'}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              vista === 'lista'
                ? 'bg-caramel-100 text-caramel-700'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                clipRule="evenodd"
              />
            </svg>
            Lista
          </button>
          <button
            type="button"
            onClick={() => setVista('mapa')}
            role="tab"
            aria-selected={vista === 'mapa'}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              vista === 'mapa'
                ? 'bg-caramel-100 text-caramel-700'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
              />
            </svg>
            Mapa
          </button>
        </div>
      </div>

      {tipo === 'criadores' && vista === 'lista' && (
        <BreedersListView searchParams={searchParams} setSearchParams={setSearchParams} />
      )}
      {tipo === 'criadores' && vista === 'mapa' && (
        <BreedersMapView searchParams={searchParams} setSearchParams={setSearchParams} />
      )}
      {tipo === 'servicos' && vista === 'lista' && (
        <ServicesListView searchParams={searchParams} setSearchParams={setSearchParams} />
      )}
      {tipo === 'servicos' && vista === 'mapa' && (
        <ServicesMapView searchParams={searchParams} setSearchParams={setSearchParams} />
      )}

      <CrossPromoBanner currentTipo={tipo} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Cross-promotion banner — sugere a outra vertical no rodape
// ─────────────────────────────────────────────────────────────────────

function CrossPromoBanner({ currentTipo }: { currentTipo: PesquisarTipo }) {
  const isCriadores = currentTipo === 'criadores'
  const eyebrow = isCriadores ? '◆ Também temos serviços' : '◆ Também temos criadores'
  const title = isCriadores
    ? 'Precisa de quem cuide do seu patudo?'
    : 'À procura de um patudo para a sua família?'
  const description = isCriadores
    ? 'Passeadores, pet-sitters e mais profissionais verificados em Portugal.'
    : 'Criadores éticos verificados, com linhagem rastreável e documentação confirmada.'
  const linkTo = isCriadores ? '/pesquisar?tipo=servicos' : '/pesquisar'
  const linkLabel = isCriadores ? 'Ver serviços' : 'Ver criadores'

  return (
    <section className="mt-16 border-t border-line pt-12">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h2 className="font-serif text-2xl text-ink">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
        </div>
        <Link to={linkTo} className="btn-secondary shrink-0">
          {linkLabel} →
        </Link>
      </div>
    </section>
  )
}
