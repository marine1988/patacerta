import Redis from 'ioredis'

/**
 * Lazy Redis client. Returns null when REDIS_URL is unset, allowing
 * callers to fall back to an in-process implementation (useful for
 * local dev and single-instance deploys).
 *
 * The connection is created once and reused across the process. We
 * disable ioredis's offline queue so callers can detect failures
 * synchronously and degrade gracefully instead of hanging on commands
 * issued while Redis is unreachable.
 */

let client: Redis | null = null
let initialised = false
let healthy = false

function init(): Redis | null {
  if (initialised) return client
  initialised = true

  const url = process.env.REDIS_URL
  if (!url) {
    console.log('[redis] REDIS_URL not set — using in-process fallbacks')
    return null
  }

  try {
    client = new Redis(url, {
      // Don't queue commands when offline — fail fast so callers can fallback.
      enableOfflineQueue: false,
      // Keep retries bounded; if Redis is down we degrade rather than block.
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      retryStrategy: (times) => {
        // Exponential-ish backoff capped at 10s.
        return Math.min(times * 500, 10_000)
      },
    })

    client.on('connect', () => {
      healthy = true
      console.log('[redis] connected')
    })
    client.on('error', (err) => {
      healthy = false
      // Avoid log spam on reconnect attempts.
      console.warn('[redis] error:', err.message)
    })
    client.on('end', () => {
      healthy = false
    })

    return client
  } catch (err) {
    console.error('[redis] failed to initialise client:', err)
    client = null
    return null
  }
}

export function getRedis(): Redis | null {
  return init()
}

export function isRedisHealthy(): boolean {
  init()
  return healthy
}
