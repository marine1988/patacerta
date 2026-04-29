import { prisma } from '../../lib/prisma.js'
import { asyncHandler } from '../../lib/helpers.js'
import { cacheGetOrSet } from '../../lib/cache.js'

const TTL_MS = 3600_000 // 1h — catalogo de racas raramente muda
const CACHE_KEY_BREEDS = 'breeds:list:v1'
const CACHE_KEY_DOG_SPECIES = 'breeds:dogSpeciesId:v1'

interface BreedListItem {
  id: number
  nameSlug: string
  namePt: string
  fciGroup: string | null
  imageUrl: string | null
}

async function getDogSpeciesId(): Promise<number | null> {
  return cacheGetOrSet<number | null>(CACHE_KEY_DOG_SPECIES, TTL_MS, async () => {
    const dog = await prisma.species.findUnique({
      where: { nameSlug: 'cao' },
      select: { id: true },
    })
    return dog?.id ?? null
  })
}

/**
 * GET /api/breeds
 * Catálogo público de raças de cão (MVP só-cães), ordenado por nome PT.
 * Cache TTL 1h via Redis (fallback in-memory) — partilhado entre instâncias.
 */
export const listBreeds = asyncHandler(async (_req, res) => {
  const data = await cacheGetOrSet<BreedListItem[]>(CACHE_KEY_BREEDS, TTL_MS, async () => {
    const dogSpeciesId = await getDogSpeciesId()
    return prisma.breed.findMany({
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
  })
  res.set('Cache-Control', 'public, max-age=3600')
  res.json(data)
})
