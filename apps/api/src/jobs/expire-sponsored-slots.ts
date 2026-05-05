/**
 * Expirar SponsoredBreedSlot cujo endsAt ja passou.
 *
 * Justificacao:
 * - O simulador de raca filtra slots activos por (status=ACTIVE AND endsAt > now).
 *   Em runtime nao causa bugs visiveis, mas tem efeitos colaterais:
 *   - O badge admin "patrocinados activos" conta linhas com status=ACTIVE
 *     mesmo apos endsAt; sem este job, o numero infla com o tempo.
 *   - O contador "occupied" no /sponsored-slot/availability ja exclui
 *     endsAt no passado via filtro temporal, mas mantem coerencia
 *     persistir o status correcto para auditoria/relatorios.
 *   - Permite ao breeder ver no Dashboard "Destaque" um historico
 *     limpo (Activos vs Expirados).
 *
 * Comportamento:
 * - Encontra slots com status=ACTIVE e endsAt < now.
 * - Marca-os como status=EXPIRED.
 * - NAO toca em paymentStatus — um slot pago que expira mantem-se
 *   PAID (a expiracao e' temporal, nao financeira).
 * - NAO toca em slots PAUSED — pausa e' decisao manual do criador.
 *
 * Idempotente: correr varias vezes seguidas e' seguro (nao ha ACTIVE
 * com endsAt no passado apos a primeira passagem).
 *
 * Como correr:
 * - Manualmente:  pnpm --filter @patacerta/api exec tsx src/jobs/expire-sponsored-slots.ts
 * - Em producao:  cron externo (Dokploy Schedules) horario.
 *   Frequencia horaria e' suficiente — a margem de 1h sobre o endsAt
 *   exacto nao tem impacto visivel ao utilizador (slots de 30 dias).
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'

async function main(): Promise<void> {
  const now = new Date()

  const result = await prisma.sponsoredBreedSlot.updateMany({
    where: {
      status: 'ACTIVE',
      endsAt: { lt: now },
    },
    data: {
      status: 'EXPIRED',
    },
  })

  console.log(
    `[expire-sponsored-slots] Expired ${result.count} sponsored slots (now=${now.toISOString()})`,
  )
}

main()
  .catch((err) => {
    console.error('[expire-sponsored-slots] FAILED:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
