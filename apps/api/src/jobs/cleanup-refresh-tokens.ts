/**
 * Cleanup de RefreshToken expirados / revogados ha muito tempo.
 *
 * Justificacao:
 * - A tabela RefreshToken cresce indefinidamente: cada login + cada
 *   rotacao gera uma linha. Sem purga, ao fim de meses temos milhoes
 *   de linhas mortas que tornam findUnique({ tokenHash }) lento e
 *   inflam backups.
 * - Tokens expirados sao seguros para apagar imediatamente: o
 *   verifyRefreshToken ja os rejeita por exp do JWT antes de chegar
 *   ao DB.
 * - Tokens revogados sao mantidos por 30 dias para preservar a chain
 *   de rotacao (revokeRefreshChain segue replacedById). Apos esse
 *   prazo, qualquer atacante que ainda guarde um token revogado vai
 *   bater em "INVALID_REFRESH_TOKEN" (a row ja nao existe), o que
 *   protege na mesma — perdemos so a distincao "reuso detectado vs
 *   token desconhecido", mas em ambos os casos o cliente e' obrigado
 *   a reautenticar.
 *
 * Como correr:
 * - Manualmente:  pnpm --filter @patacerta/api exec tsx src/jobs/cleanup-refresh-tokens.ts
 * - Em producao:  cron externo (Dokploy / k8s CronJob) diario as 03:00.
 *   Mantemos o processo API stateless — nao queremos node-cron embutido.
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'

const REVOKED_RETENTION_DAYS = 30

async function main(): Promise<void> {
  const now = new Date()
  const cutoff = new Date(now.getTime() - REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        // Expirados ja nao tem qualquer utilidade.
        { expiresAt: { lt: now } },
        // Revogados ha mais de 30 dias.
        { revokedAt: { lt: cutoff } },
      ],
    },
  })

  console.log(
    `[cleanup-refresh-tokens] Removed ${result.count} stale refresh tokens (cutoff=${cutoff.toISOString()})`,
  )
}

main()
  .catch((err) => {
    console.error('[cleanup-refresh-tokens] FAILED:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
