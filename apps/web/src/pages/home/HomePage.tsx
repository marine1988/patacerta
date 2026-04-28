import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { SearchBar } from '../../components/shared/SearchBar'
import { FeaturedCarousel, FeaturedBadge } from '../../components/home/FeaturedCarousel'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { formatPrice, type ServicePriceUnit } from '../../lib/format'

interface PublicStats {
  breederCount: number
  speciesCount?: number
  breedCount: number
  districtCount: number
  reviewCount: number
  serviceCount: number
}

interface FeaturedService {
  id: number
  title: string
  priceCents: number
  priceUnit: ServicePriceUnit
  currency: string
  /** Decimal serializado pelo Prisma vem como string. */
  avgRating: number | string | null
  reviewCount: number
  featuredUntil: string | null
  photos: { id: number; url: string; sortOrder: number }[]
  category: { id: number; nameSlug: string; namePt: string }
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
}

interface FeaturedBreeder {
  id: number
  businessName: string
  description: string | null
  avgRating: number | string | null
  reviewCount: number
  featuredUntil: string | null
  district: { id: number; namePt: string }
  municipality: { id: number; namePt: string }
}

interface FeaturedResponse {
  services: FeaturedService[]
  breeders: FeaturedBreeder[]
}

export function HomePage() {
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ['public-stats'],
    queryFn: () => api.get('/search/stats').then((r) => r.data),
    staleTime: 3600_000,
  })

  const { data: featured, isLoading: featuredLoading } = useQuery<FeaturedResponse>({
    queryKey: ['home-featured'],
    queryFn: () => api.get('/home/featured').then((r) => r.data),
    // Cache curto para nao reembaralhar a cada navegacao mas variar entre sessoes.
    staleTime: 30_000,
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
            <Stat value={stats?.breedCount} label="Raças" />
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
       * DESTAQUES — dois carrosseis horizontais (estilo OLX)
       * ============================================================ */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-[72rem] space-y-16 px-6 py-16 lg:px-8">
          <FeaturedCarousel
            eyebrow="◆ Destaques · Serviços"
            title="Serviços em foco"
            isLoading={featuredLoading}
            emptyMessage="Sem serviços em destaque de momento."
            skeleton={<FeaturedServiceSkeleton />}
          >
            {featured?.services.map((s) => (
              <FeaturedServiceItem key={s.id} service={s} />
            ))}
          </FeaturedCarousel>

          <FeaturedCarousel
            eyebrow="◆ Destaques · Criadores"
            title="Criadores em foco"
            isLoading={featuredLoading}
            emptyMessage="Sem criadores em destaque de momento."
            skeleton={<FeaturedBreederSkeleton />}
          >
            {featured?.breeders.map((b) => (
              <FeaturedBreederItem key={b.id} breeder={b} />
            ))}
          </FeaturedCarousel>
        </div>
      </section>

      {/* ============================================================
       * SIMULADOR — banner editorial para o quiz de raça
       * ============================================================ */}
      <section className="border-t border-line bg-caramel-100/40">
        <div className="mx-auto max-w-[72rem] px-6 py-20 lg:px-8">
          <div className="grid items-center gap-12 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="eyebrow mb-6">◆ Simulador de raça</p>
              <h2 className="font-serif text-h2 text-ink">
                Escolha o <em className="italic text-caramel-500">companheiro ideal</em> para si.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">
                Onze perguntas, dois minutos. Indicamos as cinco raças que melhor se adaptam ao seu
                espaço, ao seu ritmo e ao seu agregado familiar — para começar a procurar com mais
                confiança.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link to="/simulador-raca" className="btn-primary btn-lg">
                  Começar simulador
                </Link>
                <span className="text-[11px] font-medium uppercase tracking-caps text-muted">
                  Gratuito · sem registo
                </span>
              </div>
              <p className="mt-8 max-w-xl text-xs leading-relaxed text-muted">
                <em className="not-italic font-medium">Nota:</em> o simulador é apenas uma
                ferramenta de orientação. Cada cão é único e a escolha final deve ser feita em
                conjunto com criadores, veterinários ou associações de adopção.
              </p>
            </div>

            {/* Aside editorial — 3 sinais visuais sobre o que o simulador avalia */}
            <aside className="border-l border-line pl-10">
              <p className="eyebrow-muted mb-6">— O que avaliamos</p>
              <ul className="space-y-5">
                <SimuladorTopic
                  number="01"
                  title="Espaço e clima"
                  description="Apartamento, casa com jardim, calor do Algarve ou serra fria."
                />
                <SimuladorTopic
                  number="02"
                  title="Ritmo e tempo"
                  description="Quanto exercício faz e quanto tempo o cão fica sozinho."
                />
                <SimuladorTopic
                  number="03"
                  title="Casa e experiência"
                  description="Crianças, outros cães, alergias, primeira vez como dono."
                />
              </ul>
            </aside>
          </div>
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

function SimuladorTopic({
  number,
  title,
  description,
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <li className="flex gap-4">
      <span className="font-serif text-2xl italic text-caramel-500">{number}</span>
      <div>
        <h4 className="font-serif text-base text-ink">{title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
      </div>
    </li>
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

/* ============================================================
 * Cards horizontais para os carrosseis de destaques
 * ============================================================ */

const ITEM_CLASSES = 'relative w-72 flex-shrink-0 snap-start sm:w-80'

/** Coage avgRating (Decimal Prisma vem como string) e arredonda a 1 casa. */
function formatRating(value: number | string | null | undefined): string | null {
  if (value == null) return null
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (!Number.isFinite(n) || n <= 0) return null
  return n.toFixed(1)
}

function FeaturedServiceItem({ service: s }: { service: FeaturedService }) {
  const cover = s.photos[0]?.url ?? null
  const isPromoted = s.featuredUntil != null && new Date(s.featuredUntil) > new Date()
  const rating = formatRating(s.avgRating)

  return (
    <Link
      to={`/servicos/${s.id}`}
      className={`${ITEM_CLASSES} group block border border-line bg-surface transition-colors hover:border-caramel-500`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-alt">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs italic text-muted">
            sem foto
          </div>
        )}
        {isPromoted && <FeaturedBadge />}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="blue">{s.category.namePt}</Badge>
          <span className="whitespace-nowrap text-sm font-semibold text-ink">
            {formatPrice(s.priceCents, s.priceUnit)}
          </span>
        </div>
        <h3 className="mt-3 line-clamp-2 font-serif text-base text-ink">{s.title}</h3>
        <p className="mt-2 text-xs text-muted">
          {s.municipality.namePt}, {s.district.namePt}
        </p>
        {rating && s.reviewCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className="font-semibold text-yellow-600">{rating}</span>
            <svg className="h-3.5 w-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-muted">({s.reviewCount})</span>
          </div>
        )}
      </div>
    </Link>
  )
}

function FeaturedBreederItem({ breeder: b }: { breeder: FeaturedBreeder }) {
  const isPromoted = b.featuredUntil != null && new Date(b.featuredUntil) > new Date()
  const rating = formatRating(b.avgRating)

  return (
    <Link
      to={`/criador/${b.id}`}
      className={`${ITEM_CLASSES} group block border border-line bg-surface p-5 transition-colors hover:border-caramel-500`}
    >
      {isPromoted && <FeaturedBadge />}
      <div className="flex items-start gap-3">
        <Avatar name={b.businessName} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-serif text-base text-ink">{b.businessName}</h3>
          <p className="mt-1 text-xs text-muted">
            {b.municipality.namePt}, {b.district.namePt}
          </p>
          {rating && b.reviewCount > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-yellow-600">{rating}</span>
              <svg className="h-3.5 w-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="text-muted">({b.reviewCount})</span>
            </div>
          )}
        </div>
      </div>
      {b.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">{b.description}</p>
      )}
    </Link>
  )
}

function FeaturedServiceSkeleton() {
  return (
    <div className="border border-line bg-surface">
      <div className="aspect-[4/3] w-full animate-pulse bg-surface-alt" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-1/3 animate-pulse bg-surface-alt" />
        <div className="h-5 w-3/4 animate-pulse bg-surface-alt" />
        <div className="h-3 w-1/2 animate-pulse bg-surface-alt" />
      </div>
    </div>
  )
}

function FeaturedBreederSkeleton() {
  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-surface-alt" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 animate-pulse bg-surface-alt" />
          <div className="h-3 w-1/2 animate-pulse bg-surface-alt" />
          <div className="h-3 w-1/3 animate-pulse bg-surface-alt" />
        </div>
      </div>
    </div>
  )
}
