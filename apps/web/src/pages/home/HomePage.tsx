import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'

interface PublicStats {
  breederCount: number
  speciesCount: number
  districtCount: number
  reviewCount: number
  serviceCount: number
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
       * HERO — editorial, agora unificado (criadores + serviços)
       * ============================================================ */}
      <section className="relative">
        <div className="mx-auto max-w-[72rem] px-6 pb-24 pt-20 lg:px-8">
          <p className="eyebrow mb-8">◆ Criadores e Serviços · Portugal</p>

          <div className="grid gap-16 lg:grid-cols-[1.3fr_1fr] lg:items-end">
            <div>
              <h1 className="display">
                O portal dos
                <br />
                <em>patudos</em> em Portugal.
              </h1>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-muted">
                Encontre criadores éticos verificados ou serviços de confiança para o seu animal —
                passeios, pet-sitting e mais. Curadoria rigorosa, comunicação direta, decisões
                informadas.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link to="/explorar" className="btn-primary">
                  Explorar criadores
                </Link>
                <Link to="/explorar?tipo=servicos" className="btn-secondary">
                  Ver serviços
                </Link>
              </div>
            </div>

            {/* Aside editorial — manifesto curto */}
            <aside className="border-l border-line pl-10">
              <p className="eyebrow-muted mb-4">— Manifesto</p>
              <p className="font-serif text-xl italic leading-snug text-ink">
                "Acreditamos que cuidar bem de um patudo começa em escolher bem — quem o cria, quem
                o passeia, quem o acompanha. Rigor, transparência e cuidado em cada passo."
              </p>
            </aside>
          </div>

          {/* Stats editoriais */}
          <div className="mt-20 grid grid-cols-2 gap-10 border-t border-line pt-10 sm:grid-cols-3 lg:grid-cols-5">
            <Stat value={stats?.breederCount} label="Criadores" />
            <Stat value={stats?.serviceCount} label="Serviços" />
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
            <span className="eyebrow">◆ Encontrar criadores</span>
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
       * SERVIÇOS — nova vertical em destaque
       * ============================================================ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[72rem] px-6 py-24 lg:px-8">
          <div className="mb-16 max-w-2xl">
            <p className="eyebrow mb-6">◆ Serviços para patudos</p>
            <h2 className="font-serif text-h2 text-ink">
              Profissionais de confiança, <em className="italic text-caramel-500">perto de si</em>.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
              Anúncios verificados de prestadores em Portugal. Procure por categoria, distrito ou
              proximidade — e fale directamente com quem vai cuidar do seu animal.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <ServiceCategoryCard
              eyebrow="01"
              title="Passeios"
              description="Passeadores experientes para o dia-a-dia ou ocasiões pontuais. Horários flexíveis, encontros presenciais antes de começar."
              href="/explorar?tipo=servicos&categoria=passeio"
            />
            <ServiceCategoryCard
              eyebrow="02"
              title="Pet-sitting"
              description="Acompanhamento ao domicílio enquanto está fora. Alimentação, medicação, companhia — sem stress de canil."
              href="/explorar?tipo=servicos&categoria=pet-sitting"
            />
          </div>

          <div className="mt-12 flex flex-col items-start gap-6 border-t border-line pt-10 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-serif text-lg italic text-muted">
              Mais categorias a chegar — banhos, treino, transporte, veterinária.
            </p>
            <Link to="/explorar?tipo=servicos" className="btn-primary">
              Ver todos os serviços
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================================
       * CTA — registar criador
       * ============================================================ */}
      <section className="border-t border-line bg-surface-alt/40">
        <div className="mx-auto max-w-[72rem] px-6 py-24 text-center lg:px-8">
          <p className="eyebrow mb-6">◆ Criador ou prestador certificado</p>
          <h2 className="font-serif text-h2 mx-auto max-w-2xl text-ink">
            Faça parte de uma rede <em className="italic text-caramel-500">selecta</em> de
            profissionais portugueses.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted">
            Visibilidade junto de famílias que procuram rigor. Perfil curado. Processo gratuito.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-6 sm:flex-row">
            <Link to="/registar" className="btn-primary btn-lg">
              Juntar-me à PataCerta
            </Link>
            <Link to="/painel?tab=servicos" className="link-editorial">
              Oferecer serviços →
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

function ServiceCategoryCard({
  eyebrow,
  title,
  description,
  href,
}: {
  eyebrow: string
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      to={href}
      className="group block border border-line bg-surface p-10 transition-colors duration-200 hover:border-caramel-500"
    >
      <p className="font-serif text-4xl font-normal italic text-caramel-500">{eyebrow}</p>
      <h3 className="mt-6 font-serif text-2xl text-ink">{title}</h3>
      <p className="mt-4 text-sm leading-relaxed text-muted">{description}</p>
      <div className="mt-8 flex items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-caps text-caramel-500 transition-colors group-hover:text-caramel-700">
          Explorar
        </span>
        <span className="h-px w-12 bg-caramel-500 transition-all duration-300 group-hover:w-24" />
      </div>
    </Link>
  )
}
