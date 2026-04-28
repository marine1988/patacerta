import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'

interface BreedsCacheEntry {
  data: Array<{
    id: number
    nameSlug: string
    namePt: string
    fciGroup: string | null
    imageUrl: string | null
  }>
  expiresAt: number
}

const TTL = 3600_000 // 1h
let breedsCache: BreedsCacheEntry | null = null
let dogSpeciesIdCache: number | null = null

async function getDogSpeciesId(): Promise<number | null> {
  if (dogSpeciesIdCache !== null) return dogSpeciesIdCache
  const dog = await prisma.species.findUnique({
    where: { nameSlug: 'cao' },
    select: { id: true },
  })
  if (!dog) return null
  dogSpeciesIdCache = dog.id
  return dog.id
}

/**
 * GET /api/breeds
 * Catálogo público de raças de cão (MVP só-cães), ordenado por nome PT.
 * Cache TTL 1h — catálogo raramente muda.
 */
export const listBreeds = asyncHandler(async (_req, res) => {
  const now = Date.now()
  if (!breedsCache || breedsCache.expiresAt < now) {
    const dogSpeciesId = await getDogSpeciesId()
    const data = await prisma.breed.findMany({
      where: dogSpeciesId !== null ? { speciesId: dogSpeciesId } : undefined,
      orderBy: { namePt: 'asc' },
      select: {
        id: true,
        nameSlug: true,
        namePt: true,
        fciGroup: true,
        imageUrl: true,
      },
    })
    breedsCache = { data, expiresAt: now + TTL }
  }
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(breedsCache!.data)
})
