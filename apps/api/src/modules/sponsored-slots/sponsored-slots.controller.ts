// ============================================
// PataCerta — Sponsored Slots Controller (público)
// ============================================
//
// POST /api/sponsored-slots/:slotId/click
//
// Endpoint público de tracking — chamado quando o utilizador clica
// num criador patrocinado no resultado do simulador. Best-effort:
// devolve 204 mesmo se o slot não existir / estiver inactivo, para
// evitar enumeration de IDs por scrapers. Rate-limited via
// apiRateLimit global.
//
// Não-transaccional: aceitamos perder alguns cliques em troca de
// latência mínima.

import { prisma } from '../../lib/prisma.js'
import { asyncHandler, parseId } from '../../lib/helpers.js'

export const trackClick = asyncHandler(async (req, res) => {
  const slotId = parseId(req.params.slotId)

  // updateMany não falha se o registo não existir — retorna count: 0.
  // Filtramos por status ACTIVE + janela activa para não inflacionar
  // métricas de campanhas pausadas/expiradas.
  const now = new Date()
  await prisma.sponsoredBreedSlot
    .updateMany({
      where: {
        id: slotId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      data: { clickCount: { increment: 1 } },
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[sponsored-slots] click increment failed', err)
    })

  res.status(204).send()
})
