/**
 * Seed DEMO (dados fictícios) — APENAS para staging/desenvolvimento.
 *
 * ⚠ NÃO correr em produção real: cria utilizadores e negócios falsos
 * (`canil.alvalade@example.pt`, NIFs inventados, fotos via picsum.photos).
 *
 * Cria:
 *   - 4 owner users fictícios (clientes para reviews)
 *   - 6 canis fictícios verificados (cobertura geográfica de PT)
 *   - 2-3 fotos picsum por canil (seed estável)
 *   - 8 reviews publicadas
 *   - ~25 serviços (passeio + pet-sitting) com coverage e fotos
 *   - cleanup de demos legados não-cão (defesa dupla com seed.ts)
 *
 * Pré-requisitos: seed.ts precisa de ter corrido antes (espécie `cao`,
 * distritos, municípios, categorias).
 *
 * Idempotente via upsert por email/título. Triggered por
 * `RUN_SEED_DEMO_ON_BOOT=true` no entrypoint, ou manualmente:
 *   pnpm --filter @patacerta/api db:seed:demo  (local)
 *   npx tsx prisma/seed-demo.ts                (no container)
 */
import {
  PrismaClient,
  UserRole,
  BreederStatus,
  ReviewStatus,
  ServiceStatus,
  PriceUnit,
} from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type BreederSeed = {
  email: string
  firstName: string
  lastName: string
  businessName: string
  nif: string
  dgavNumber: string
  description: string
  website?: string
  phone: string
  districtCode: string
  municipalityCode: string
  status: BreederStatus
  /** URLs picsum.photos (seed estavel para reproducibilidade). 1a = capa. */
  photoSeeds: number[]
}

// MVP: apenas criadores de cães. Demo breeders de gatos/coelhos/aves/pequenos
// animais foram removidos (mantém-se cobertura geográfica relevante).
const BREEDERS: BreederSeed[] = [
  {
    email: 'canil.alvalade@example.pt',
    firstName: 'Ana',
    lastName: 'Martins',
    businessName: 'Canil de Alvalade',
    nif: '501234567',
    dgavNumber: 'DGAV-2019-001',
    description:
      'Canil familiar especializado em Labrador Retriever e Golden Retriever. Criação responsável com foco em temperamento equilibrado e saúde. Todos os cachorros são entregues com desparasitação completa, primeiras vacinas e microchip.',
    website: 'https://canildealvalade.pt',
    phone: '912345678',
    districtCode: '11',
    municipalityCode: '1101',
    status: BreederStatus.VERIFIED,
    photoSeeds: [2001, 2002, 2003],
  },
  {
    email: 'canil.douro@example.pt',
    firstName: 'João',
    lastName: 'Silva',
    businessName: 'Canil do Douro',
    nif: '502345678',
    dgavNumber: 'DGAV-2020-015',
    description:
      'Canil especializado em Pastor Alemão e Border Collie. Cachorros criados em ambiente familiar, com socialização diária e testes genéticos aos progenitores.',
    website: 'https://canildodouro.pt',
    phone: '913456789',
    districtCode: '13',
    municipalityCode: '1301',
    status: BreederStatus.VERIFIED,
    photoSeeds: [2010, 2011],
  },
  {
    email: 'canil.serra@example.pt',
    firstName: 'Rui',
    lastName: 'Costa',
    businessName: 'Canil da Serra',
    nif: '505678901',
    dgavNumber: 'DGAV-2022-110',
    description:
      'Especialistas em Serra da Estrela e Rafeiro do Alentejo — raças portuguesas autóctones. Trabalhamos para preservar a linhagem com rigor e amor.',
    phone: '916789012',
    districtCode: '18',
    municipalityCode: '1801',
    status: BreederStatus.VERIFIED,
    photoSeeds: [2020, 2021],
  },
  {
    email: 'canil.algarve@example.pt',
    firstName: 'Sofia',
    lastName: 'Rodrigues',
    businessName: 'Canil do Algarve',
    nif: '506789012',
    dgavNumber: 'DGAV-2023-005',
    description:
      'Canil de pequeno porte no Algarve, especializado em Cavalier King Charles e Bichon Frisé. Pequena criação familiar, máxima atenção a cada cachorro. Contrato de adoção e acompanhamento pós-entrega.',
    website: 'https://canildoalgarve.pt',
    phone: '917890123',
    districtCode: '08',
    municipalityCode: '0801',
    status: BreederStatus.VERIFIED,
    photoSeeds: [2030, 2031, 2032],
  },
  {
    email: 'criador.minho@example.pt',
    firstName: 'Carlos',
    lastName: 'Oliveira',
    businessName: 'Criador do Minho',
    nif: '507890123',
    dgavNumber: 'DGAV-2020-077',
    description:
      'Criação de Cão de Água Português e Podengo Português. Cães de trabalho e companhia, com testes de saúde (displasia, cardiologia, oftalmologia).',
    phone: '918901234',
    districtCode: '16',
    municipalityCode: '1601',
    status: BreederStatus.VERIFIED,
    photoSeeds: [2040, 2041],
  },
  {
    email: 'canil.aveiro@example.pt',
    firstName: 'Maria',
    lastName: 'Sousa',
    businessName: 'Canil de Aveiro',
    nif: '503456789',
    dgavNumber: 'DGAV-2021-042',
    description:
      'Pequeno canil familiar em Aveiro com criação de Beagle e Cocker Spaniel. Pais selecionados por temperamento e conformidade com o padrão. Manual de cuidados incluído em cada adoção.',
    phone: '914567890',
    districtCode: '03',
    municipalityCode: '0301',
    status: BreederStatus.VERIFIED,
    photoSeeds: [2050, 2051],
  },
]

type OwnerSeed = {
  email: string
  firstName: string
  lastName: string
}

const OWNERS: OwnerSeed[] = [
  { email: 'cliente1@example.pt', firstName: 'Beatriz', lastName: 'Lopes' },
  { email: 'cliente2@example.pt', firstName: 'Miguel', lastName: 'Santos' },
  { email: 'cliente3@example.pt', firstName: 'Catarina', lastName: 'Neves' },
  { email: 'cliente4@example.pt', firstName: 'Tiago', lastName: 'Mendes' },
]

type ReviewSeed = {
  breederEmail: string
  authorEmail: string
  rating: number
  title: string
  body: string
  reply?: string
}

const REVIEWS: ReviewSeed[] = [
  {
    breederEmail: 'canil.alvalade@example.pt',
    authorEmail: 'cliente1@example.pt',
    rating: 5,
    title: 'Experiência incrível',
    body: 'A Ana é extremamente profissional. A nossa Golden chegou a casa saudável, socializada e com toda a documentação em ordem. Recomendo vivamente.',
    reply: 'Muito obrigada pela confiança, Beatriz! Fico feliz por saber que está tudo bem.',
  },
  {
    breederEmail: 'canil.alvalade@example.pt',
    authorEmail: 'cliente2@example.pt',
    rating: 5,
    title: 'Criador de confiança',
    body: 'Ambiente limpo, cães saudáveis e acompanhamento pós-venda fantástico. Voltaria sem hesitar.',
  },
  {
    breederEmail: 'canil.douro@example.pt',
    authorEmail: 'cliente3@example.pt',
    rating: 5,
    title: 'Pastor Alemão maravilhoso',
    body: 'O João enviou fotos e vídeos durante todo o processo. O nosso cachorro é um amor, saudável e muito sociável.',
    reply: 'Obrigado Catarina! Envie-nos sempre novidades dele.',
  },
  {
    breederEmail: 'canil.douro@example.pt',
    authorEmail: 'cliente4@example.pt',
    rating: 4,
    title: 'Boa experiência',
    body: 'Correu tudo bem, apenas demorou um pouco a responder inicialmente mas depois foi impecável.',
  },
  {
    breederEmail: 'canil.aveiro@example.pt',
    authorEmail: 'cliente1@example.pt',
    rating: 5,
    title: 'Beagle adorável',
    body: 'A Maria cuida dos seus cães com imenso amor. Recebemos um manual muito completo e apoio sempre que precisámos.',
  },
  {
    breederEmail: 'canil.serra@example.pt',
    authorEmail: 'cliente2@example.pt',
    rating: 5,
    title: 'Serra da Estrela de excelência',
    body: 'Raça portuguesa preservada com paixão. O Rui é um verdadeiro conhecedor. Cão magnífico e equilibrado.',
    reply: 'Obrigado Miguel, é uma honra.',
  },
  {
    breederEmail: 'canil.algarve@example.pt',
    authorEmail: 'cliente3@example.pt',
    rating: 5,
    title: 'Cavalier maravilhoso',
    body: 'A Sofia foi muito atenciosa. O cachorro veio com contrato, manual e até brinquedinhos. Adorámos.',
  },
  {
    breederEmail: 'criador.minho@example.pt',
    authorEmail: 'cliente4@example.pt',
    rating: 4,
    title: 'Cão de Água excelente',
    body: 'Muito satisfeito com o nosso cachorro. Pais testados, cão saudável e bem socializado. Só demorou mais tempo que o esperado.',
  },
]

type ServiceSeed = {
  providerEmail: string // referencia o user de um BREEDERS[i].email
  categorySlug: 'passeio' | 'pet-sitting'
  title: string
  description: string
  priceCents: number
  priceUnit: PriceUnit
  districtCode: string
  municipalityCode: string
  /** Pequeno offset random aplicado ao centroide do municipio para os pontos nao colidirem todos. */
  latOffset: number
  lngOffset: number
  serviceRadiusKm: number
  status: ServiceStatus
  /** URLs publicos picsum.photos (seed estavel para reproducibilidade). */
  photoSeeds: number[]
  /** Cobertura adicional em municipios alem do principal. */
  extraCoverageCodes?: string[]
}

const SERVICES: ServiceSeed[] = [
  // ── Lisboa metro (Ana — canil.alvalade) ──
  {
    providerEmail: 'canil.alvalade@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios diários em Alvalade',
    description:
      'Passeios de 45 min em grupos pequenos (máx 3 cães), com foco em socialização e exercício adaptado à idade. Recolha e entrega em casa dentro de Alvalade e arredores.',
    priceCents: 1200,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '11',
    municipalityCode: '1101',
    latOffset: 0.012,
    lngOffset: -0.005,
    serviceRadiusKm: 5,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [101, 102, 103],
    extraCoverageCodes: ['1110'],
  },
  {
    providerEmail: 'canil.alvalade@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting em sua casa — Lisboa',
    description:
      'Cuido do seu cão na sua própria casa enquanto está fora. Visitas de 30/60 min com alimentação, água fresca, brincadeira e relatório fotográfico.',
    priceCents: 1800,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '11',
    municipalityCode: '1101',
    latOffset: -0.008,
    lngOffset: 0.01,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [104, 105],
  },
  {
    providerEmail: 'canil.alvalade@example.pt',
    categorySlug: 'passeio',
    title: 'Caminhadas longas ao fim-de-semana',
    description:
      'Saídas de 2h ao Parque Florestal de Monsanto, ideais para cães activos. Limite 2 cães por saída.',
    priceCents: 2500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '11',
    municipalityCode: '1101',
    latOffset: 0.02,
    lngOffset: 0.018,
    serviceRadiusKm: 10,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [106],
  },

  // ── Sintra/Cascais (mesma Ana, cobertura adicional) ──
  {
    providerEmail: 'canil.alvalade@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting em Cascais e Oeiras',
    description:
      'Disponível para férias e fins-de-semana. Experiência com cães seniores e medicação. Referências disponíveis.',
    priceCents: 2200,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '11',
    municipalityCode: '1103',
    latOffset: 0.005,
    lngOffset: 0.003,
    serviceRadiusKm: 12,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [107, 108],
    extraCoverageCodes: ['1104'],
  },

  // ── Porto metro (João — canil.douro) ──
  {
    providerEmail: 'canil.douro@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting ao domicílio — Porto',
    description:
      'Visitas diárias com alimentação, brincadeira e companhia. Ideal para quem viaja e quer manter o cão na rotina familiar.',
    priceCents: 1500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1301',
    latOffset: 0.007,
    lngOffset: -0.012,
    serviceRadiusKm: 6,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [201, 202, 203],
    extraCoverageCodes: ['1302', '1303'],
  },
  {
    providerEmail: 'canil.douro@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios na Foz e Marginal',
    description:
      'Passeios de 1h pela Foz do Douro, marginal e parques verdes. Cães bem socializados e em boa forma física.',
    priceCents: 1400,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1301',
    latOffset: -0.015,
    lngOffset: -0.025,
    serviceRadiusKm: 5,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [204, 205],
  },
  {
    providerEmail: 'canil.douro@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Estadia prolongada — Vila Nova de Gaia',
    description:
      'Recebo o seu cão em minha casa durante férias longas. Espaço amplo, jardim murado, máximo 2 hóspedes em simultâneo.',
    priceCents: 2500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1302',
    latOffset: 0.01,
    lngOffset: 0.008,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [206],
  },

  // ── Braga (Carlos — criador.minho) ──
  {
    providerEmail: 'criador.minho@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios desportivos em Braga',
    description:
      'Para cães activos e jovens. Trail-running e caminhadas exigentes. Experiência com raças de trabalho.',
    priceCents: 1500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '03',
    municipalityCode: '0301',
    latOffset: 0.006,
    lngOffset: 0.004,
    serviceRadiusKm: 10,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [301, 302],
  },
  {
    providerEmail: 'criador.minho@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting em Braga e Guimarães',
    description:
      'Visitas diárias ou hospedagem em minha casa rural. Excelente para cães de médio/grande porte que precisam de espaço.',
    priceCents: 2000,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '03',
    municipalityCode: '0301',
    latOffset: -0.01,
    lngOffset: -0.008,
    serviceRadiusKm: 15,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [303],
    extraCoverageCodes: ['0302'],
  },

  // ── Faro/Algarve (Sofia — canil.algarve) ──
  {
    providerEmail: 'canil.algarve@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting no Algarve — Faro',
    description:
      'Cuido do seu cão enquanto está de férias. Sou veterinária assistente, experiência com administração de medicação e cuidados pós-cirúrgicos.',
    priceCents: 2800,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '08',
    municipalityCode: '0801',
    latOffset: 0.004,
    lngOffset: 0.007,
    serviceRadiusKm: 15,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [501, 502, 503],
    extraCoverageCodes: ['0802', '0803'],
  },
  {
    providerEmail: 'canil.algarve@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios costeiros — Faro e Olhão',
    description:
      'Passeios matinais junto à Ria Formosa, perfeitos para cães que adoram água. Apenas cães pequenos e médios.',
    priceCents: 1500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '08',
    municipalityCode: '0801',
    latOffset: -0.006,
    lngOffset: 0.014,
    serviceRadiusKm: 10,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [504],
    extraCoverageCodes: ['0807'],
  },
  {
    providerEmail: 'canil.algarve@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Estadia premium em Albufeira',
    description:
      'Casa com piscina e jardim murado. Máximo 1 hóspede por estadia para atenção total. Inclui escovagem diária e fotos.',
    priceCents: 3500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '08',
    municipalityCode: '0802',
    latOffset: 0.008,
    lngOffset: -0.01,
    serviceRadiusKm: 20,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [505, 506],
  },

  // ── Aveiro (Maria — canil.aveiro) ──
  {
    providerEmail: 'canil.aveiro@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting rural em Aveiro',
    description:
      'Quinta com espaço para cães correrem livremente. Experiência com animais tímidos e idosos. Acompanhamento veterinário próximo.',
    priceCents: 2000,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '01',
    municipalityCode: '0101',
    latOffset: 0.012,
    lngOffset: -0.008,
    serviceRadiusKm: 12,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [601, 602],
  },
  {
    providerEmail: 'canil.aveiro@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios na Ria de Aveiro',
    description:
      'Passeios pela ria e salinas. Cenários únicos e cães felizes. Recolha em Aveiro centro.',
    priceCents: 1400,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '01',
    municipalityCode: '0101',
    latOffset: -0.01,
    lngOffset: 0.006,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [603],
  },

  // ── Viseu (Rui — canil.serra) ──
  {
    providerEmail: 'canil.serra@example.pt',
    categorySlug: 'passeio',
    title: 'Caminhadas na Serra da Estrela',
    description:
      'Saídas de meio-dia em trilhos da Serra. Para cães habituados a esforço físico. Inclui água e snacks.',
    priceCents: 4000,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '18',
    municipalityCode: '1801',
    latOffset: 0.005,
    lngOffset: 0.005,
    serviceRadiusKm: 25,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [701, 702],
  },
  {
    providerEmail: 'canil.serra@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting em Viseu',
    description:
      'Visitas em sua casa em Viseu cidade. Especialista em raças autóctones portuguesas e cães grandes.',
    priceCents: 1800,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '18',
    municipalityCode: '1801',
    latOffset: -0.007,
    lngOffset: -0.011,
    serviceRadiusKm: 10,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [703],
  },

  // ── Coimbra ──
  {
    providerEmail: 'criador.minho@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting Coimbra (ocasional)',
    description:
      'Disponível em Coimbra alguns fins-de-semana por mês. Reserva com 2 semanas de antecedência.',
    priceCents: 2200,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '06',
    municipalityCode: '0601',
    latOffset: 0.011,
    lngOffset: -0.013,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [901],
  },

  // ── Évora (Sofia — cobertura no sul, exemplo de prestador "viajante") ──
  {
    providerEmail: 'canil.algarve@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios em Évora — disponibilidade limitada',
    description:
      'Passeios em Évora apenas durante a semana, manhãs. Conheço bem o centro histórico e arredores.',
    priceCents: 1500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '07',
    municipalityCode: '0701',
    latOffset: 0.004,
    lngOffset: 0.009,
    serviceRadiusKm: 6,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [1001],
  },

  // ── Leiria ──
  {
    providerEmail: 'canil.aveiro@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Estadia em Leiria — quinta familiar',
    description:
      'Estadia em ambiente rural calmo, ideal para cães que precisam descansar. Espaço amplo e seguro.',
    priceCents: 2400,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '10',
    municipalityCode: '1001',
    latOffset: -0.012,
    lngOffset: 0.007,
    serviceRadiusKm: 15,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [1101, 1102],
  },

  // ── Sintra (mais um na zona Lisboa para densidade) ──
  {
    providerEmail: 'canil.alvalade@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios em Sintra — natureza',
    description:
      'Passeios em zonas verdes de Sintra, perfeitos para cães urbanos que precisam de natureza. Saídas de 90 min.',
    priceCents: 1800,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '11',
    municipalityCode: '1102',
    latOffset: 0.013,
    lngOffset: -0.018,
    serviceRadiusKm: 10,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [1201],
    extraCoverageCodes: ['1109'],
  },

  // ── Matosinhos (denser Porto cluster) ──
  {
    providerEmail: 'canil.douro@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios na praia de Matosinhos',
    description:
      'Passeios na praia ao amanhecer ou ao pôr-do-sol. Cães adoram. Limite 2 por saída.',
    priceCents: 1400,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1303',
    latOffset: 0.008,
    lngOffset: -0.014,
    serviceRadiusKm: 6,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [1301],
  },

  // ── Loulé (Algarve cluster) ──
  {
    providerEmail: 'canil.algarve@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting em Loulé',
    description:
      'Visitas curtas no horário da tarde. Bom para cães que ficam sozinhos enquanto trabalha.',
    priceCents: 1100,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '08',
    municipalityCode: '0803',
    latOffset: -0.009,
    lngOffset: 0.011,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [1401],
  },

  // ── Guimarães (Braga cluster) ──
  {
    providerEmail: 'criador.minho@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios urbanos em Guimarães',
    description:
      'Passeios de 1h pelo centro histórico e parques. Bom para cães habituados a meios urbanos.',
    priceCents: 1300,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '03',
    municipalityCode: '0302',
    latOffset: 0.005,
    lngOffset: 0.006,
    serviceRadiusKm: 7,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [1501],
  },

  // ── DRAFT (para ver na lista do painel mas nao no diretorio publico) ──
  {
    providerEmail: 'canil.alvalade@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Estadia premium em Lisboa (rascunho)',
    description: 'Serviço em preparação. Vai abrir nas próximas semanas com vagas limitadas.',
    priceCents: 4500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '11',
    municipalityCode: '1101',
    latOffset: 0.015,
    lngOffset: 0.012,
    serviceRadiusKm: 5,
    status: ServiceStatus.DRAFT,
    photoSeeds: [],
  },

  // ── PAUSED (visivel no painel, escondido publico) ──
  {
    providerEmail: 'canil.douro@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios em férias (pausado)',
    description:
      'Serviço pausado durante o mês de Agosto. Reabre em Setembro. Aceito reservas para essa data.',
    priceCents: 1500,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1301',
    latOffset: 0.003,
    lngOffset: 0.009,
    serviceRadiusKm: 5,
    status: ServiceStatus.PAUSED,
    photoSeeds: [1601],
  },
]

async function main() {
  // Fetch reference data
  const districts = await prisma.district.findMany()
  const municipalities = await prisma.municipality.findMany()
  // MVP: todos os breeders são de cães. Resolvemos o speciesId 'cao' uma vez.
  const dogSpecies = await prisma.species.findUnique({ where: { nameSlug: 'cao' } })
  if (!dogSpecies) {
    throw new Error('Espécie "cao" não encontrada — corra primeiro o seed principal.')
  }

  // ---- Cleanup legacy demo breeders (não-cão) ----
  // MVP so-caes: removemos demos antigos de gatos/coelhos/aves/pequenos animais
  // que possam estar persistidos em DBs anteriores. Identificamos por email.
  const LEGACY_DEMO_EMAILS = [
    'gatil.portucale@example.pt',
    'gatil.algarve@example.pt',
    'quinta.dos.coelhos@example.pt',
    'aviario.douro@example.pt',
    'petlovers.setubal@example.pt',
  ]
  console.log('Cleaning up legacy non-dog demo breeders...')
  const legacyUsers = await prisma.user.findMany({
    where: { email: { in: LEGACY_DEMO_EMAILS } },
    select: { id: true, email: true },
  })
  if (legacyUsers.length > 0) {
    const legacyUserIds = legacyUsers.map((u) => u.id)
    const legacyBreeders = await prisma.breeder.findMany({
      where: { userId: { in: legacyUserIds } },
      select: { id: true },
    })
    const legacyBreederIds = legacyBreeders.map((b) => b.id)

    if (legacyBreederIds.length > 0) {
      // Apaga dependentes que não cascateiam automaticamente.
      await prisma.review.deleteMany({ where: { breederId: { in: legacyBreederIds } } })
      await prisma.breederSpecies.deleteMany({
        where: { breederId: { in: legacyBreederIds } },
      })
      await prisma.breeder.deleteMany({ where: { id: { in: legacyBreederIds } } })
    }
    // Serviços e fotos cascateiam via FK no User; mas serviços do legacy provider
    // não têm FK em cascade — apaga manualmente.
    await prisma.serviceCoverage.deleteMany({
      where: { service: { providerId: { in: legacyUserIds } } },
    })
    await prisma.servicePhoto.deleteMany({
      where: { service: { providerId: { in: legacyUserIds } } },
    })
    await prisma.service.deleteMany({ where: { providerId: { in: legacyUserIds } } })
    await prisma.user.deleteMany({ where: { id: { in: legacyUserIds } } })
    console.log(`  ✓ Removed ${legacyUsers.length} legacy demo users + dependents`)
  } else {
    console.log('  ✓ No legacy demo users found')
  }

  const districtByCode = new Map(districts.map((d) => [d.code, d.id]))
  const munByCode = new Map(municipalities.map((m) => [m.code, m.id]))

  const defaultPassword = 'DemoPass123'
  const passwordHash = await bcrypt.hash(defaultPassword, 12)

  // ---- Create owner users (for reviews) ----
  console.log('Creating demo owner users...')
  const ownerByEmail = new Map<string, number>()
  for (const o of OWNERS) {
    const user = await prisma.user.upsert({
      where: { email: o.email },
      update: { emailVerified: true },
      create: {
        email: o.email,
        passwordHash,
        firstName: o.firstName,
        lastName: o.lastName,
        role: UserRole.OWNER,
        emailVerified: true,
      },
    })
    ownerByEmail.set(o.email, user.id)
  }
  console.log(`  ✓ ${OWNERS.length} owners ready`)

  // ---- Create breeders ----
  console.log('\nCreating demo breeders...')
  const breederIdByEmail = new Map<string, number>()
  for (const b of BREEDERS) {
    const districtId = districtByCode.get(b.districtCode)
    const municipalityId = munByCode.get(b.municipalityCode)
    if (!districtId || !municipalityId) {
      console.warn(`  ✗ Skipping ${b.businessName}: district/municipality not found`)
      continue
    }

    const user = await prisma.user.upsert({
      where: { email: b.email },
      update: { role: UserRole.BREEDER, emailVerified: true },
      create: {
        email: b.email,
        passwordHash,
        firstName: b.firstName,
        lastName: b.lastName,
        role: UserRole.BREEDER,
        phone: b.phone,
        emailVerified: true,
      },
    })

    const breeder = await prisma.breeder.upsert({
      where: { userId: user.id },
      update: {
        businessName: b.businessName,
        nif: b.nif,
        dgavNumber: b.dgavNumber,
        description: b.description,
        website: b.website ?? null,
        phone: b.phone,
        status: b.status,
        districtId,
        municipalityId,
      },
      create: {
        userId: user.id,
        businessName: b.businessName,
        nif: b.nif,
        dgavNumber: b.dgavNumber,
        description: b.description,
        website: b.website ?? null,
        phone: b.phone,
        status: b.status,
        districtId,
        municipalityId,
      },
    })
    breederIdByEmail.set(b.email, breeder.id)

    // Species link — MVP: sempre 'cao'
    await prisma.breederSpecies.deleteMany({ where: { breederId: breeder.id } })
    await prisma.breederSpecies.create({
      data: { breederId: breeder.id, speciesId: dogSpecies.id },
    })

    // Photos: URLs publicos picsum.photos com seed estavel
    await prisma.breederPhoto.deleteMany({ where: { breederId: breeder.id } })
    for (let i = 0; i < b.photoSeeds.length; i++) {
      const seed = b.photoSeeds[i]
      await prisma.breederPhoto.create({
        data: {
          breederId: breeder.id,
          url: `https://picsum.photos/seed/patacerta-breeder-${seed}/800/600`,
          sortOrder: i,
        },
      })
    }
    console.log(`  ✓ ${b.businessName} (${b.status})`)
  }

  // ---- Create reviews ----
  console.log('\nCreating demo reviews...')
  let reviewCount = 0
  for (const r of REVIEWS) {
    const breederId = breederIdByEmail.get(r.breederEmail)
    const authorId = ownerByEmail.get(r.authorEmail)
    if (!breederId || !authorId) continue

    await prisma.review.upsert({
      where: { breederId_authorId: { breederId, authorId } },
      update: {
        rating: r.rating,
        title: r.title,
        body: r.body,
        reply: r.reply ?? null,
        repliedAt: r.reply ? new Date() : null,
        status: ReviewStatus.PUBLISHED,
      },
      create: {
        breederId,
        authorId,
        rating: r.rating,
        title: r.title,
        body: r.body,
        reply: r.reply ?? null,
        repliedAt: r.reply ? new Date() : null,
        status: ReviewStatus.PUBLISHED,
      },
    })
    reviewCount++
  }
  console.log(`  ✓ ${reviewCount} reviews created`)

  // ---- Create services ----
  console.log('\nCreating demo services...')
  // mapa email -> userId (precisamos do user, nao do breeder, para Service.providerId)
  const userIdByEmail = new Map<string, number>()
  for (const b of BREEDERS) {
    const u = await prisma.user.findUnique({ where: { email: b.email }, select: { id: true } })
    if (u) userIdByEmail.set(b.email, u.id)
  }

  // mapa code -> { id, latitude, longitude } para distritos
  const districtByCodeFull = new Map(
    districts.map((d) => [d.code, { id: d.id, latitude: d.latitude, longitude: d.longitude }]),
  )

  // mapa code -> id para municipios (para coverage areas + lookup)
  const munIdByCode = new Map(municipalities.map((m) => [m.code, m.id]))

  const categories = await prisma.serviceCategory.findMany()
  const categoryIdBySlug = new Map(categories.map((c) => [c.nameSlug, c.id]))

  let serviceCount = 0
  let coverageCount = 0
  let photoCount = 0
  for (const s of SERVICES) {
    const providerId = userIdByEmail.get(s.providerEmail)
    const categoryId = categoryIdBySlug.get(s.categorySlug)
    const districtFull = districtByCodeFull.get(s.districtCode)
    const districtId = districtFull?.id
    const municipalityId = munIdByCode.get(s.municipalityCode)

    if (!providerId || !categoryId || !districtId || !municipalityId || !districtFull) {
      console.warn(`  ✗ Skipping "${s.title}": missing reference data`)
      continue
    }
    if (districtFull.latitude == null || districtFull.longitude == null) {
      console.warn(`  ✗ Skipping "${s.title}": district sem coordenadas`)
      continue
    }

    const latitude = Number(districtFull.latitude) + s.latOffset
    const longitude = Number(districtFull.longitude) + s.lngOffset

    // Upsert por (providerId, title) — title é unique-na-pratica para o mesmo provider neste seed.
    // Sem unique no schema, fazemos lookup manual.
    const existing = await prisma.service.findFirst({
      where: { providerId, title: s.title },
      select: { id: true },
    })

    const data = {
      providerId,
      categoryId,
      title: s.title,
      description: s.description,
      priceCents: s.priceCents,
      priceUnit: s.priceUnit,
      currency: 'EUR',
      districtId,
      municipalityId,
      latitude,
      longitude,
      geocodedAt: new Date(),
      geocodeSource: 'seed-demo',
      serviceRadiusKm: s.serviceRadiusKm,
      status: s.status,
      publishedAt: s.status === ServiceStatus.ACTIVE ? new Date() : null,
    }

    let service
    if (existing) {
      service = await prisma.service.update({ where: { id: existing.id }, data })
    } else {
      service = await prisma.service.create({ data })
    }
    serviceCount++

    // Coverage areas (municipio principal sempre incluido + extras)
    const allCoverageCodes = new Set<string>([s.municipalityCode, ...(s.extraCoverageCodes ?? [])])
    await prisma.serviceCoverage.deleteMany({ where: { serviceId: service.id } })
    for (const code of allCoverageCodes) {
      const munId = munIdByCode.get(code)
      if (!munId) continue
      await prisma.serviceCoverage.create({
        data: { serviceId: service.id, municipalityId: munId },
      })
      coverageCount++
    }

    // Photos: URLs publicos picsum.photos com seed estavel
    await prisma.servicePhoto.deleteMany({ where: { serviceId: service.id } })
    for (let i = 0; i < s.photoSeeds.length; i++) {
      const seed = s.photoSeeds[i]
      await prisma.servicePhoto.create({
        data: {
          serviceId: service.id,
          url: `https://picsum.photos/seed/patacerta-svc-${seed}/800/600`,
          sortOrder: i,
        },
      })
      photoCount++
    }
  }
  console.log(`  ✓ ${serviceCount} services, ${coverageCount} coverage links, ${photoCount} photos`)

  console.log('\n========================================')
  console.log('  Demo seed completed!')
  console.log('========================================')
  console.log(`  Owners:   ${OWNERS.length}`)
  console.log(`  Breeders: ${BREEDERS.length}`)
  console.log(`  Reviews:  ${reviewCount}`)
  console.log(`  Services: ${serviceCount}`)
  console.log(`  Login pw: ${defaultPassword}`)
  console.log('========================================\n')
}

main()
  .catch((e) => {
    console.error('Demo seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
