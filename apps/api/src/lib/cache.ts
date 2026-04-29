import { getRedis, isRedisHealthy } from './redis.js'

/**
 * Cache abstraction com fallback automatico para in-process Map quando
 * Redis nao esta' disponivel. Usar em hot-paths de leitura publica.
 *
 * Estrategia:
 * - Se Redis estiver "healthy" (ligacao activa), usa-o como source-of-truth.
 *   Permite escalar horizontalmente (multiplas instancias da API partilham o cache).
 * - Caso contrario, mantem um Map em memoria por processo. Aceitavel para
 *   single-instance ou dev local; em multi-instancia degrada para
 *   "cache duplicado por instancia" mas continua a evitar pressao na DB.
 *
 * O fallback in-memory limita-se a 1000 entradas (LRU simples por
 * timestamp de insercao) para nunca virar memory-leak quando o caller
 * for excessivamente generoso com chaves dinamicas.
 */

interface InMemoryEntry {
  value: unknown
  expiresAt: number
  insertedAt: number
}

const MEMORY_MAX_ENTRIES = 1000
const memory = new Map<string, InMemoryEntry>()

function evictIfNeeded(): void {
  if (memory.size < MEMORY_MAX_ENTRIES) return
  // Remove os 10% mais antigos por insertedAt.
  const targetSize = Math.floor(MEMORY_MAX_ENTRIES * 0.9)
  const sorted = [...memory.entries()].sort((a, b) => a[1].insertedAt - b[1].insertedAt)
  const toRemove = sorted.slice(0, memory.size - targetSize)
  for (const [k] of toRemove) memory.delete(k)
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (redis && isRedisHealthy()) {
    try {
      const raw = await redis.get(key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      // Fallthrough to in-memory.
    }
  }
  const entry = memory.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    memory.delete(key)
    return null
  }
  return entry.value as T
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const redis = getRedis()
  if (redis && isRedisHealthy()) {
    try {
      // PX = expiry em ms. Tratamos o JSON.stringify aqui para o caller
      // nao se preocupar em serializar.
      await redis.set(key, JSON.stringify(value), 'PX', ttlMs)
      return
    } catch {
      // Fallthrough.
    }
  }
  evictIfNeeded()
  memory.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    insertedAt: Date.now(),
  })
}

/**
 * Get cached value or compute via `loader` and cache the result.
 * O `loader` so' e' chamado em cache-miss; race conditions simultaneas
 * sao toleradas (ultima escrita vence — aceitavel para caches read-heavy).
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key)
  if (cached !== null) return cached
  const fresh = await loader()
  // Nao falhamos o request se a escrita do cache falhar.
  cacheSet(key, fresh, ttlMs).catch(() => undefined)
  return fresh
}

/**
 * Invalida uma chave especifica. Usar quando a fonte muda (ex.: criar
 * raca nova => invalidar 'breeds:list').
 */
export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  if (redis && isRedisHealthy()) {
    try {
      await redis.del(key)
    } catch {
      // Ignora — Map fallback e' purgado abaixo.
    }
  }
  memory.delete(key)
}

/**
 * Invalida por prefixo. Em Redis usa SCAN+DEL; em memoria itera o Map.
 * Util para invalidar familias inteiras (ex.: 'home:*' apos featured update).
 */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  const redis = getRedis()
  if (redis && isRedisHealthy()) {
    try {
      const stream = redis.scanStream({ match: `${prefix}*`, count: 100 })
      const pipeline = redis.pipeline()
      let queued = 0
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (keys: string[]) => {
          for (const k of keys) {
            pipeline.del(k)
            queued++
          }
        })
        stream.on('end', () => resolve())
        stream.on('error', reject)
      })
      if (queued > 0) await pipeline.exec()
    } catch {
      // Ignora.
    }
  }
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key)
  }
}
