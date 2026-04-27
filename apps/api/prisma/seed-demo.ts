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
  speciesSlugs: string[]
  status: BreederStatus
}

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
    speciesSlugs: ['cao'],
    status: BreederStatus.VERIFIED,
  },
  {
    email: 'gatil.portucale@example.pt',
    firstName: 'João',
    lastName: 'Silva',
    businessName: 'Gatil Portucale',
    nif: '502345678',
    dgavNumber: 'DGAV-2020-015',
    description:
      'Gatil especializado em Maine Coon e British Shorthair. Gatinhos criados em ambiente familiar, com socialização diária e testes genéticos aos progenitores.',
    website: 'https://gatilportucale.pt',
    phone: '913456789',
    districtCode: '13',
    municipalityCode: '1301',
    speciesSlugs: ['gato'],
    status: BreederStatus.VERIFIED,
  },
  {
    email: 'quinta.dos.coelhos@example.pt',
    firstName: 'Maria',
    lastName: 'Sousa',
    businessName: 'Quinta dos Coelhos',
    nif: '503456789',
    dgavNumber: 'DGAV-2021-042',
    description:
      'Criação de coelhos anões e mini-lops. Pais selecionados por temperamento e conformidade com o padrão. Manual de cuidados incluído em cada adoção.',
    phone: '914567890',
    districtCode: '03',
    municipalityCode: '0301',
    speciesSlugs: ['coelho'],
    status: BreederStatus.VERIFIED,
  },
  {
    email: 'aviario.douro@example.pt',
    firstName: 'Pedro',
    lastName: 'Ferreira',
    businessName: 'Aviário do Douro',
    nif: '504567890',
    dgavNumber: 'DGAV-2018-208',
    description:
      'Aviário dedicado a canários de cor e periquitos. Anilhas oficiais FOP, alimentação premium e controlo veterinário regular.',
    website: 'https://aviariododouro.pt',
    phone: '915678901',
    districtCode: '13',
    municipalityCode: '1302',
    speciesSlugs: ['ave'],
    status: BreederStatus.VERIFIED,
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
    speciesSlugs: ['cao'],
    status: BreederStatus.VERIFIED,
  },
  {
    email: 'gatil.algarve@example.pt',
    firstName: 'Sofia',
    lastName: 'Rodrigues',
    businessName: 'Gatil do Algarve',
    nif: '506789012',
    dgavNumber: 'DGAV-2023-005',
    description:
      'Gatil de Ragdoll e Siameses. Pequena criação familiar no Algarve, máxima atenção a cada gatinho. Contrato de adoção e acompanhamento pós-entrega.',
    website: 'https://gatildoalgarve.pt',
    phone: '917890123',
    districtCode: '08',
    municipalityCode: '0801',
    speciesSlugs: ['gato'],
    status: BreederStatus.VERIFIED,
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
    speciesSlugs: ['cao'],
    status: BreederStatus.VERIFIED,
  },
  {
    email: 'petlovers.setubal@example.pt',
    firstName: 'Inês',
    lastName: 'Pereira',
    businessName: 'PetLovers Setúbal',
    nif: '508901234',
    dgavNumber: 'DGAV-2024-018',
    description:
      'Criação multi-espécie: hamsters sírios, porquinhos-da-índia e chinchilas. Habitats amplos, socialização diária e guias de cuidado detalhados.',
    phone: '919012345',
    districtCode: '15',
    municipalityCode: '1501',
    speciesSlugs: ['hamster', 'porquinho-da-india', 'chinchila'],
    status: BreederStatus.PENDING_VERIFICATION,
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
    breederEmail: 'gatil.portucale@example.pt',
    authorEmail: 'cliente3@example.pt',
    rating: 5,
    title: 'Maine Coon maravilhoso',
    body: 'O João enviou fotos e vídeos durante todo o processo. O nosso gatinho é um amor, saudável e muito sociável.',
    reply: 'Obrigado Catarina! Envie-nos sempre novidades dele.',
  },
  {
    breederEmail: 'gatil.portucale@example.pt',
    authorEmail: 'cliente4@example.pt',
    rating: 4,
    title: 'Boa experiência',
    body: 'Correu tudo bem, apenas demorou um pouco a responder inicialmente mas depois foi impecável.',
  },
  {
    breederEmail: 'quinta.dos.coelhos@example.pt',
    authorEmail: 'cliente1@example.pt',
    rating: 5,
    title: 'Coelhinhos adoráveis',
    body: 'A Maria cuida destes coelhos com imenso amor. Recebemos um manual muito completo e apoio sempre que precisámos.',
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
    breederEmail: 'gatil.algarve@example.pt',
    authorEmail: 'cliente3@example.pt',
    rating: 5,
    title: 'Ragdoll maravilhosa',
    body: 'A Sofia foi muito atenciosa. A gatinha veio com contrato, manual e até brinquedinhos. Adorámos.',
  },
  {
    breederEmail: 'criador.minho@example.pt',
    authorEmail: 'cliente4@example.pt',
    rating: 4,
    title: 'Cão de Água excelente',
    body: 'Muito satisfeito com o nosso cachorro. Pais testados, cão saudável e bem socializado. Só demorou mais tempo que o esperado.',
  },
  {
    breederEmail: 'aviario.douro@example.pt',
    authorEmail: 'cliente1@example.pt',
    rating: 5,
    title: 'Canário belíssimo',
    body: 'Aves saudáveis, bem cuidadas e com anilhas oficiais. O Pedro deu todas as indicações necessárias.',
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

  // ── Porto metro (João — gatil.portucale) ──
  {
    providerEmail: 'gatil.portucale@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Cuidador de gatos ao domicílio — Porto',
    description:
      'Especializado em felinos. Visitas diárias com limpeza de caixa, alimentação e companhia. Ideal para quem viaja e deixa o gato em casa.',
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
    providerEmail: 'gatil.portucale@example.pt',
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
    providerEmail: 'gatil.portucale@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Estadia prolongada — Vila Nova de Gaia',
    description:
      'Recebo o seu animal em minha casa durante férias longas. Espaço amplo, jardim murado, máximo 2 hóspedes em simultâneo.',
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

  // ── Setúbal (Inês — petlovers.setubal) ──
  {
    providerEmail: 'petlovers.setubal@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Cuidados para pequenos animais — Setúbal',
    description:
      'Especialista em hamsters, porquinhos-da-índia, chinchilas e coelhos. Sei limpar habitats e administrar medicação específica.',
    priceCents: 1000,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '15',
    municipalityCode: '1501',
    latOffset: 0.008,
    lngOffset: -0.006,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [401, 402],
  },
  {
    providerEmail: 'petlovers.setubal@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios em Almada e Costa da Caparica',
    description:
      'Passeios de 1h junto à praia. Os seus cães vão adorar a areia e o mar. Tenho transporte para grupos pequenos.',
    priceCents: 1300,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '15',
    municipalityCode: '1502',
    latOffset: -0.005,
    lngOffset: 0.012,
    serviceRadiusKm: 12,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [403, 404],
    extraCoverageCodes: ['1501', '1503'],
  },

  // ── Faro/Algarve (Sofia — gatil.algarve) ──
  {
    providerEmail: 'gatil.algarve@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting no Algarve — Faro',
    description:
      'Cuido do seu animal enquanto está de férias. Sou veterinária assistente, experiência com administração de medicação e cuidados pós-cirúrgicos.',
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
    providerEmail: 'gatil.algarve@example.pt',
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
    providerEmail: 'gatil.algarve@example.pt',
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

  // ── Aveiro (Maria — quinta.dos.coelhos) ──
  {
    providerEmail: 'quinta.dos.coelhos@example.pt',
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
    providerEmail: 'quinta.dos.coelhos@example.pt',
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

  // ── Viana do Castelo (Pedro — aviario.douro) ──
  {
    providerEmail: 'aviario.douro@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Cuidador de aves — Vila do Conde',
    description:
      'Especializado em aves de gaiola: canários, periquitos, calopsitas. Sei limpar, alimentar e detectar sinais de doença.',
    priceCents: 1200,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1310',
    latOffset: 0.009,
    lngOffset: 0.004,
    serviceRadiusKm: 15,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [801],
    extraCoverageCodes: ['1312'],
  },
  {
    providerEmail: 'aviario.douro@example.pt',
    categorySlug: 'passeio',
    title: 'Passeios na Póvoa de Varzim',
    description: 'Passeios pela orla marítima da Póvoa. Bom para cães que gostam de praia e areia.',
    priceCents: 1300,
    priceUnit: PriceUnit.PER_SESSION,
    districtCode: '13',
    municipalityCode: '1312',
    latOffset: -0.006,
    lngOffset: -0.008,
    serviceRadiusKm: 8,
    status: ServiceStatus.ACTIVE,
    photoSeeds: [802],
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

  // ── Évora (Ana — cobertura no sul, exemplo de prestador "viajante") ──
  {
    providerEmail: 'gatil.algarve@example.pt',
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
    providerEmail: 'quinta.dos.coelhos@example.pt',
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
    providerEmail: 'gatil.portucale@example.pt',
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
    providerEmail: 'gatil.algarve@example.pt',
    categorySlug: 'pet-sitting',
    title: 'Pet sitting em Loulé',
    description:
      'Visitas curtas no horário da tarde. Bom para gatos que ficam sozinhos enquanto trabalha.',
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
    providerEmail: 'gatil.portucale@example.pt',
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
  const species = await prisma.species.findMany()

  const districtByCode = new Map(districts.map((d) => [d.code, d.id]))
  const munByCode = new Map(municipalities.map((m) => [m.code, m.id]))
  const speciesBySlug = new Map(species.map((s) => [s.nameSlug, s.id]))

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

    // Species links
    await prisma.breederSpecies.deleteMany({ where: { breederId: breeder.id } })
    for (const slug of b.speciesSlugs) {
      const speciesId = speciesBySlug.get(slug)
      if (speciesId) {
        await prisma.breederSpecies.create({
          data: { breederId: breeder.id, speciesId },
        })
      }
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
