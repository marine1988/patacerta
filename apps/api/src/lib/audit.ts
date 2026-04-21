import { prisma } from './prisma.js'

interface AuditEntry {
  userId?: number
  action: string
  entity: string
  entityId?: number
  details?: string
  ipAddress?: string
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({ data: entry })
  } catch (err) {
    // Don't let audit logging failures break the request
    console.error('[AuditLog] Failed to write:', err)
  }
}
