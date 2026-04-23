import { PrismaClient, UserRole, BreederStatus, ReviewStatus } from '@prisma/client'
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

async function main() {
  console.log('🌱 Starting demo seed...\n')

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
      update: {},
      create: {
        email: o.email,
        passwordHash,
        firstName: o.firstName,
        lastName: o.lastName,
        role: UserRole.OWNER,
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
      update: { role: UserRole.BREEDER },
      create: {
        email: b.email,
        passwordHash,
        firstName: b.firstName,
        lastName: b.lastName,
        role: UserRole.BREEDER,
        phone: b.phone,
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

  console.log('\n========================================')
  console.log('  Demo seed completed!')
  console.log('========================================')
  console.log(`  Owners:   ${OWNERS.length}`)
  console.log(`  Breeders: ${BREEDERS.length}`)
  console.log(`  Reviews:  ${reviewCount}`)
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
