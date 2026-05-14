import { prisma } from './prisma.js'

interface AuditEntry {
  /**
   * Actor humano da accao. `undefined` ou `null` quando a accao foi
   * executada por um job/sistema (ex.: REVIEW_AUTO_FLAGGED, cron de
   * expiracao de slots). Persistido na coluna `userId` que e' nullable
   * no schema.
   */
  userId?: number | null
  action: string
  entity: string
  entityId?: number
  details?: string
  ipAddress?: string
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        details: entry.details,
        ipAddress: entry.ipAddress,
      },
    })
  } catch (err) {
    // Don't let audit logging failures break the request
    console.error('[AuditLog] Failed to write:', err)
  }
}
