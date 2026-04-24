import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...\n')

  // ---- Admin User ----
  console.log('Creating admin user...')
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@patacerta.pt'
  const adminPass = process.env.ADMIN_PASSWORD || 'AdminPass123!'
  const passwordHash = await bcrypt.hash(adminPass, 12)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { emailVerified: true, role: UserRole.ADMIN },
    create: {
      email: adminEmail,
      passwordHash,
      firstName: 'Admin',
      lastName: 'PataCerta',
      role: UserRole.ADMIN,
      emailVerified: true,
    },
  })
  console.log(`  ✓ Admin user created (id: ${admin.id}, email: ${adminEmail})`)

  // ---- Districts ----
  // Centroides aproximados (capital de distrito / cidade principal da região)
  console.log('\nSeeding districts...')
  const districtsData = [
    { code: '01', namePt: 'Aveiro', latitude: 40.6405, longitude: -8.6538 },
    { code: '02', namePt: 'Beja', latitude: 38.015, longitude: -7.865 },
    { code: '03', namePt: 'Braga', latitude: 41.5454, longitude: -8.4265 },
    { code: '04', namePt: 'Bragança', latitude: 41.8061, longitude: -6.7567 },
    { code: '05', namePt: 'Castelo Branco', latitude: 39.8222, longitude: -7.491 },
    { code: '06', namePt: 'Coimbra', latitude: 40.2033, longitude: -8.4103 },
    { code: '07', namePt: 'Évora', latitude: 38.5711, longitude: -7.9135 },
    { code: '08', namePt: 'Faro', latitude: 37.0194, longitude: -7.9304 },
    { code: '09', namePt: 'Guarda', latitude: 40.5371, longitude: -7.2683 },
    { code: '10', namePt: 'Leiria', latitude: 39.7477, longitude: -8.8071 },
    { code: '11', namePt: 'Lisboa', latitude: 38.7223, longitude: -9.1393 },
    { code: '12', namePt: 'Portalegre', latitude: 39.2936, longitude: -7.4289 },
    { code: '13', namePt: 'Porto', latitude: 41.1579, longitude: -8.6291 },
    { code: '14', namePt: 'Santarém', latitude: 39.2369, longitude: -8.6852 },
    { code: '15', namePt: 'Setúbal', latitude: 38.5244, longitude: -8.8882 },
    { code: '16', namePt: 'Viana do Castelo', latitude: 41.6932, longitude: -8.8326 },
    { code: '17', namePt: 'Vila Real', latitude: 41.3004, longitude: -7.7441 },
    { code: '18', namePt: 'Viseu', latitude: 40.661, longitude: -7.9097 },
    { code: '31', namePt: 'Região Autónoma dos Açores', latitude: 37.7412, longitude: -25.6756 },
    { code: '32', namePt: 'Região Autónoma da Madeira', latitude: 32.6669, longitude: -16.9241 },
  ]

  const districts: Record<string, number> = {}
  for (const d of districtsData) {
    const district = await prisma.district.upsert({
      where: { code: d.code },
      update: { namePt: d.namePt, latitude: d.latitude, longitude: d.longitude },
      create: d,
    })
    districts[d.code] = district.id
  }
  console.log(`  ✓ ${districtsData.length} districts seeded`)

  // ---- Municipalities ----
  console.log('\nSeeding municipalities...')
  const municipalitiesData: { districtCode: string; code: string; namePt: string }[] = [
    // 01 Aveiro
    { districtCode: '01', code: '0101', namePt: 'Aveiro' },
    { districtCode: '01', code: '0102', namePt: 'Águeda' },
    { districtCode: '01', code: '0103', namePt: 'Ovar' },
    { districtCode: '01', code: '0104', namePt: 'Ílhavo' },
    // 02 Beja
    { districtCode: '02', code: '0201', namePt: 'Beja' },
    { districtCode: '02', code: '0202', namePt: 'Moura' },
    { districtCode: '02', code: '0203', namePt: 'Serpa' },
    // 03 Braga
    { districtCode: '03', code: '0301', namePt: 'Braga' },
    { districtCode: '03', code: '0302', namePt: 'Guimarães' },
    { districtCode: '03', code: '0303', namePt: 'Barcelos' },
    { districtCode: '03', code: '0304', namePt: 'Vila Nova de Famalicão' },
    { districtCode: '03', code: '0305', namePt: 'Vizela' },
    // 04 Bragança
    { districtCode: '04', code: '0401', namePt: 'Bragança' },
    { districtCode: '04', code: '0402', namePt: 'Mirandela' },
    { districtCode: '04', code: '0403', namePt: 'Macedo de Cavaleiros' },
    // 05 Castelo Branco
    { districtCode: '05', code: '0501', namePt: 'Castelo Branco' },
    { districtCode: '05', code: '0502', namePt: 'Covilhã' },
    { districtCode: '05', code: '0503', namePt: 'Fundão' },
    // 06 Coimbra
    { districtCode: '06', code: '0601', namePt: 'Coimbra' },
    { districtCode: '06', code: '0602', namePt: 'Figueira da Foz' },
    { districtCode: '06', code: '0603', namePt: 'Cantanhede' },
    // 07 Évora
    { districtCode: '07', code: '0701', namePt: 'Évora' },
    { districtCode: '07', code: '0702', namePt: 'Estremoz' },
    { districtCode: '07', code: '0703', namePt: 'Reguengos de Monsaraz' },
    // 08 Faro
    { districtCode: '08', code: '0801', namePt: 'Faro' },
    { districtCode: '08', code: '0802', namePt: 'Albufeira' },
    { districtCode: '08', code: '0803', namePt: 'Loulé' },
    { districtCode: '08', code: '0804', namePt: 'Portimão' },
    { districtCode: '08', code: '0805', namePt: 'Lagos' },
    { districtCode: '08', code: '0806', namePt: 'Tavira' },
    { districtCode: '08', code: '0807', namePt: 'Olhão' },
    { districtCode: '08', code: '0808', namePt: 'Silves' },
    // 09 Guarda
    { districtCode: '09', code: '0901', namePt: 'Guarda' },
    { districtCode: '09', code: '0902', namePt: 'Seia' },
    { districtCode: '09', code: '0903', namePt: 'Gouveia' },
    // 10 Leiria
    { districtCode: '10', code: '1001', namePt: 'Leiria' },
    { districtCode: '10', code: '1002', namePt: 'Caldas da Rainha' },
    { districtCode: '10', code: '1003', namePt: 'Peniche' },
    { districtCode: '10', code: '1004', namePt: 'Marinha Grande' },
    // 11 Lisboa
    { districtCode: '11', code: '1101', namePt: 'Lisboa' },
    { districtCode: '11', code: '1102', namePt: 'Sintra' },
    { districtCode: '11', code: '1103', namePt: 'Cascais' },
    { districtCode: '11', code: '1104', namePt: 'Oeiras' },
    { districtCode: '11', code: '1105', namePt: 'Amadora' },
    { districtCode: '11', code: '1106', namePt: 'Loures' },
    { districtCode: '11', code: '1107', namePt: 'Torres Vedras' },
    { districtCode: '11', code: '1108', namePt: 'Vila Franca de Xira' },
    { districtCode: '11', code: '1109', namePt: 'Mafra' },
    { districtCode: '11', code: '1110', namePt: 'Odivelas' },
    // 12 Portalegre
    { districtCode: '12', code: '1201', namePt: 'Portalegre' },
    { districtCode: '12', code: '1202', namePt: 'Elvas' },
    { districtCode: '12', code: '1203', namePt: 'Campo Maior' },
    // 13 Porto
    { districtCode: '13', code: '1301', namePt: 'Porto' },
    { districtCode: '13', code: '1302', namePt: 'Vila Nova de Gaia' },
    { districtCode: '13', code: '1303', namePt: 'Matosinhos' },
    { districtCode: '13', code: '1304', namePt: 'Maia' },
    { districtCode: '13', code: '1305', namePt: 'Gondomar' },
    { districtCode: '13', code: '1306', namePt: 'Valongo' },
    { districtCode: '13', code: '1307', namePt: 'Penafiel' },
    { districtCode: '13', code: '1308', namePt: 'Amarante' },
    { districtCode: '13', code: '1309', namePt: 'Santo Tirso' },
    { districtCode: '13', code: '1310', namePt: 'Vila do Conde' },
    { districtCode: '13', code: '1311', namePt: 'Trofa' },
    { districtCode: '13', code: '1312', namePt: 'Póvoa de Varzim' },
    // 14 Santarém
    { districtCode: '14', code: '1401', namePt: 'Santarém' },
    { districtCode: '14', code: '1402', namePt: 'Tomar' },
    { districtCode: '14', code: '1403', namePt: 'Abrantes' },
    // 15 Setúbal
    { districtCode: '15', code: '1501', namePt: 'Setúbal' },
    { districtCode: '15', code: '1502', namePt: 'Almada' },
    { districtCode: '15', code: '1503', namePt: 'Seixal' },
    { districtCode: '15', code: '1504', namePt: 'Barreiro' },
    { districtCode: '15', code: '1505', namePt: 'Palmela' },
    { districtCode: '15', code: '1506', namePt: 'Sesimbra' },
    // 16 Viana do Castelo
    { districtCode: '16', code: '1601', namePt: 'Viana do Castelo' },
    { districtCode: '16', code: '1602', namePt: 'Ponte de Lima' },
    { districtCode: '16', code: '1603', namePt: 'Caminha' },
    // 17 Vila Real
    { districtCode: '17', code: '1701', namePt: 'Vila Real' },
    { districtCode: '17', code: '1702', namePt: 'Chaves' },
    { districtCode: '17', code: '1703', namePt: 'Peso da Régua' },
    // 18 Viseu
    { districtCode: '18', code: '1801', namePt: 'Viseu' },
    { districtCode: '18', code: '1802', namePt: 'Lamego' },
    { districtCode: '18', code: '1803', namePt: 'Tondela' },
    // 31 Açores
    { districtCode: '31', code: '3101', namePt: 'Ponta Delgada' },
    { districtCode: '31', code: '3102', namePt: 'Angra do Heroísmo' },
    { districtCode: '31', code: '3103', namePt: 'Horta' },
    // 32 Madeira
    { districtCode: '32', code: '3201', namePt: 'Funchal' },
    { districtCode: '32', code: '3202', namePt: 'Câmara de Lobos' },
    { districtCode: '32', code: '3203', namePt: 'Santa Cruz' },
  ]

  let municipalityCount = 0
  for (const m of municipalitiesData) {
    const districtId = districts[m.districtCode]
    await prisma.municipality.upsert({
      where: { code: m.code },
      update: { namePt: m.namePt, districtId },
      create: { code: m.code, namePt: m.namePt, districtId },
    })
    municipalityCount++
  }
  console.log(`  ✓ ${municipalityCount} municipalities seeded`)

  // ---- Species ----
  console.log('\nSeeding species...')
  const speciesData = [
    { nameSlug: 'cao', namePt: 'Cão' },
    { nameSlug: 'gato', namePt: 'Gato' },
    { nameSlug: 'coelho', namePt: 'Coelho' },
    { nameSlug: 'hamster', namePt: 'Hamster' },
    { nameSlug: 'porquinho-da-india', namePt: 'Porquinho-da-índia' },
    { nameSlug: 'chinchila', namePt: 'Chinchila' },
    { nameSlug: 'furao', namePt: 'Furão' },
    { nameSlug: 'ave', namePt: 'Ave' },
    { nameSlug: 'reptil', namePt: 'Réptil' },
    { nameSlug: 'peixe', namePt: 'Peixe' },
    { nameSlug: 'cavalo', namePt: 'Cavalo' },
    { nameSlug: 'outro', namePt: 'Outro' },
  ]

  for (const s of speciesData) {
    await prisma.species.upsert({
      where: { nameSlug: s.nameSlug },
      update: { namePt: s.namePt },
      create: s,
    })
  }
  console.log(`  ✓ ${speciesData.length} species seeded`)

  // ---- Service Categories ----
  // Apenas passeio e pet-sitting activas no MVP; restantes na tabela para
  // activar em iterações futuras sem migração.
  console.log('\nSeeding service categories...')
  const serviceCategoriesData = [
    { nameSlug: 'passeio', namePt: 'Passeio de Cães', isActive: true },
    { nameSlug: 'pet-sitting', namePt: 'Pet Sitting', isActive: true },
    { nameSlug: 'veterinario', namePt: 'Veterinário', isActive: false },
    { nameSlug: 'tosquia', namePt: 'Tosquia / Grooming', isActive: false },
    { nameSlug: 'treino', namePt: 'Treino / Comportamento', isActive: false },
    { nameSlug: 'transporte', namePt: 'Transporte de Animais', isActive: false },
    { nameSlug: 'fotografia', namePt: 'Fotografia Animal', isActive: false },
    { nameSlug: 'outro', namePt: 'Outro', isActive: false },
  ]

  for (const c of serviceCategoriesData) {
    await prisma.serviceCategory.upsert({
      where: { nameSlug: c.nameSlug },
      update: { namePt: c.namePt, isActive: c.isActive },
      create: c,
    })
  }
  console.log(`  ✓ ${serviceCategoriesData.length} service categories seeded`)

  // ---- Summary ----
  console.log('\n========================================')
  console.log('  Seed completed successfully!')
  console.log('========================================')
  console.log(`  Users:             1`)
  console.log(`  Districts:         ${districtsData.length}`)
  console.log(`  Municipalities:    ${municipalityCount}`)
  console.log(`  Species:           ${speciesData.length}`)
  console.log(`  Service categories: ${serviceCategoriesData.length}`)
  console.log('========================================\n')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
