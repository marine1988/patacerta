import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'

interface PublicStats {
  breederCount: number
  speciesCount: number
  districtCount: number
  reviewCount: number
}

export function HomePage() {
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ['public-stats'],
    queryFn: () => api.get('/search/stats').then((r) => r.data),
    staleTime: 3600_000,
  })

  return (
    <div>
      {/* ============================================================
       * HERO — editorial
       * ============================================================ */}
      <section className="relative">
        <div className="mx-auto max-w-[72rem] px-6 pb-24 pt-20 lg:px-8">
          <p className="eyebrow mb-8">◆ Criadores verificados · Portugal</p>

          <div className="grid gap-16 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <h1 className="display">
                A arte de
                <br />
                <em>escolher bem.</em>
              </h1>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted">
                Uma curadoria rigorosa de criadores éticos em Portugal. Cada ficha verificada, cada
                linhagem rastreável, cada cão com a família certa.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link to="/diretorio" className="btn-primary">
                  Explorar diretório
                </Link>
                <Link to="/registar" className="link-editorial">
                  Sou criador →
                </Link>
              </div>
            </div>

            {/* Aside editorial — manifesto curto */}
            <aside className="border-l border-line pl-10">
              <p className="eyebrow-muted mb-4">— Manifesto</p>
              <p className="font-serif text-xl italic leading-snug text-ink">
                "Acreditamos que escolher um cão é escolher uma família. E que nenhuma família
                merece menos do que rigor, transparência e cuidado."
              </p>
            </aside>
          </div>

          {/* Stats editoriais */}
          <div className="mt-20 grid grid-cols-2 gap-10 border-t border-line pt-10 sm:grid-cols-4">
            <Stat value={stats?.breederCount} label="Criadores" />
            <Stat value={stats?.speciesCount} label="Espécies" />
            <Stat value={stats?.districtCount} label="Distritos" />
            <Stat value={stats?.reviewCount} label="Avaliações" />
          </div>
        </div>
      </section>

      {/* ============================================================
       * SEARCH — barra integrada, não gritante
       * ============================================================ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[72rem] px-6 py-16 lg:px-8">
          <div className="mb-8 flex items-baseline gap-3">
            <span className="eyebrow">◆ Encontrar</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <SearchBar />
        </div>
      </section>

      {/* ============================================================
       * PILLARS — 3 features em grelha editorial
       * ============================================================ */}
      <section className="border-t border-line bg-surface-alt/40">
        <div className="mx-auto max-w-[72rem] px-6 py-24 lg:px-8">
          <div className="mb-16 max-w-2xl">
            <p className="eyebrow mb-6">— O que nos distingue</p>
            <h2 className="font-serif text-h2 text-ink">
              Três princípios que nos guiam em{' '}
              <em className="italic text-caramel-500">cada verificação</em>.
            </h2>
          </div>

          <div className="grid gap-12 md:grid-cols-3">
            <Pillar
              number="01"
              title="Verificação documental"
              description="Confirmamos registo DGAV, NIF e documentação de cada criador antes de aprovar o perfil. Sem exceções."
            />
            <Pillar
              number="02"
              title="Transparência de linhagem"
              description="Progenitores identificados, histórico de ninhadas e testes de saúde visíveis para cada interessado."
            />
            <Pillar
              number="03"
              title="Comunicação direta"
              description="Mensagens privadas entre famílias e criadores, com moderação e respeito pelo bem-estar animal."
            />
          </div>
        </div>
      </section>

      {/* ============================================================
       * CTA — registar criador
       * ============================================================ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[72rem] px-6 py-24 text-center lg:px-8">
          <p className="eyebrow mb-6">◆ Criador certificado</p>
          <h2 className="font-serif text-h2 mx-auto max-w-2xl text-ink">
            Torne-se parte de uma rede <em className="italic text-caramel-500">selecta</em> de
            criadores portugueses.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted">
            Visibilidade junto de famílias que procuram rigor. Perfil curado. Processo gratuito.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
            <Link to="/registar" className="btn-primary btn-lg">
              Juntar-me à PataCerta
            </Link>
            <Link to="/diretorio" className="link-editorial">
              Ver diretório →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div>
      <p className="font-serif text-4xl font-normal leading-none text-ink sm:text-5xl">
        {value ?? '—'}
      </p>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-caps text-muted">{label}</p>
    </div>
  )
}

function Pillar({
  number,
  title,
  description,
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <article className="group">
      <p className="font-serif text-5xl font-normal italic text-caramel-500">{number}</p>
      <h3 className="mt-6 font-serif text-2xl text-ink">{title}</h3>
      <p className="mt-4 text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-6 h-px w-12 bg-caramel-500 transition-all duration-300 group-hover:w-24" />
    </article>
  )
}
