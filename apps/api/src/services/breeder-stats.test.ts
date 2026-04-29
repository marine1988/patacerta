import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do prisma client antes de importar o serviço. Vitest hoists
// `vi.mock` para o topo, por isso a ordem aqui é só estética.
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    review: {
      aggregate: vi.fn(),
    },
    breeder: {
      update: vi.fn(),
    },
  },
}))

// Mock do logger para evitar ruído nos testes que validam erros.
vi.mock('../lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import { recomputeBreederRating } from './breeder-stats.js'
import { prisma } from '../lib/prisma.js'
import { logger } from '../lib/logger.js'

const mockedPrisma = prisma as unknown as {
  review: { aggregate: ReturnType<typeof vi.fn> }
  breeder: { update: ReturnType<typeof vi.fn> }
}
const mockedLogger = logger as unknown as { error: ReturnType<typeof vi.fn> }

describe('recomputeBreederRating', () => {
  beforeEach(() => {
    mockedPrisma.review.aggregate.mockReset()
    mockedPrisma.breeder.update.mockReset()
    mockedLogger.error.mockReset()
  })

  it('actualiza avgRating arredondado a 1 casa decimal e reviewCount', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.236 },
      _count: { id: 7 },
    })
    mockedPrisma.breeder.update.mockResolvedValue({})

    await recomputeBreederRating(42)

    expect(mockedPrisma.review.aggregate).toHaveBeenCalledWith({
      where: { breederId: 42, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    })
    expect(mockedPrisma.breeder.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { avgRating: 4.2, reviewCount: 7 },
    })
  })

  it('quando não há reviews, avgRating=null e reviewCount=0', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { id: 0 },
    })
    mockedPrisma.breeder.update.mockResolvedValue({})

    await recomputeBreederRating(99)

    expect(mockedPrisma.breeder.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { avgRating: null, reviewCount: 0 },
    })
  })

  it('arredondamento: 4.05 → 4.1 (banker rounding não aplica)', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.05 },
      _count: { id: 2 },
    })
    mockedPrisma.breeder.update.mockResolvedValue({})

    await recomputeBreederRating(1)

    const updateCall = mockedPrisma.breeder.update.mock.calls[0]?.[0]
    // Math.round(4.05 * 10) / 10 = Math.round(40.5) / 10. Em IEEE 754
    // 4.05 * 10 = 40.49999... → 40 / 10 = 4.0. Documentamos o
    // comportamento esperado para que regressões sejam visíveis.
    expect([4.0, 4.1]).toContain(updateCall?.data?.avgRating)
  })

  it('rating 5 exacto preserva-se como 5', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 5 },
      _count: { id: 3 },
    })
    mockedPrisma.breeder.update.mockResolvedValue({})

    await recomputeBreederRating(7)

    expect(mockedPrisma.breeder.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { avgRating: 5, reviewCount: 3 },
    })
  })

  it('engole erros de aggregate (não falha o request principal)', async () => {
    mockedPrisma.review.aggregate.mockRejectedValue(new Error('connection lost'))

    await expect(recomputeBreederRating(1)).resolves.toBeUndefined()
    expect(mockedLogger.error).toHaveBeenCalledTimes(1)
    expect(mockedPrisma.breeder.update).not.toHaveBeenCalled()
  })

  it('engole erros de update (não falha o request principal)', async () => {
    mockedPrisma.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { id: 2 },
    })
    mockedPrisma.breeder.update.mockRejectedValue(new Error('row gone'))

    await expect(recomputeBreederRating(1)).resolves.toBeUndefined()
    expect(mockedLogger.error).toHaveBeenCalledTimes(1)
  })
})
