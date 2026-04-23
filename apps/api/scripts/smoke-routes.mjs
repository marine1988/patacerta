// Runtime smoke test: load all routers, enumerate endpoints, verify handler bindings.
// Run with: node apps/api/scripts/smoke-routes.mjs
import 'dotenv/config'

// Minimal env so modules that read it don't blow up at import-time.
process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db'
process.env.JWT_SECRET ??= 'smoke-test-secret-not-used'
process.env.NODE_ENV ??= 'test'

const modules = [
  ['health', '../dist/modules/health/health.router.js', 'healthRouter'],
  ['auth', '../dist/modules/auth/auth.router.js', 'authRouter'],
  ['users', '../dist/modules/users/users.router.js', 'usersRouter'],
  ['breeders', '../dist/modules/breeders/breeders.router.js', 'breedersRouter'],
  ['verification', '../dist/modules/verification/verification.router.js', 'verificationRouter'],
  ['search', '../dist/modules/search/search.router.js', 'searchRouter'],
  ['reviews', '../dist/modules/reviews/reviews.router.js', 'reviewsRouter'],
  ['messages', '../dist/modules/messages/messages.router.js', 'messagesRouter'],
  ['admin', '../dist/modules/admin/admin.router.js', 'adminRouter'],
]

function extractRoutes(router) {
  const out = []
  for (const layer of router.stack ?? []) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase())
      const handlers = layer.route.stack.length
      const hasFn = layer.route.stack.every((s) => typeof s.handle === 'function')
      out.push({ methods, path: layer.route.path, handlers, hasFn })
    } else if (layer.name === 'router' && layer.handle?.stack) {
      for (const sub of layer.handle.stack) {
        if (sub.route) {
          const methods = Object.keys(sub.route.methods).map((m) => m.toUpperCase())
          const handlers = sub.route.stack.length
          const hasFn = sub.route.stack.every((s) => typeof s.handle === 'function')
          out.push({ methods, path: sub.route.path, handlers, hasFn })
        }
      }
    }
  }
  return out
}

const prefixes = {
  health: '/api/health',
  auth: '/api/auth',
  users: '/api/users',
  breeders: '/api/breeders',
  verification: '/api/verification',
  search: '/api/search',
  reviews: '/api/reviews',
  messages: '/api/messages',
  admin: '/api/admin',
}

let totalRoutes = 0
let failures = 0

for (const [name, path, exportName] of modules) {
  try {
    const mod = await import(path)
    const router = mod[exportName]
    if (!router) {
      console.error(`[FAIL] ${name}: export ${exportName} missing`)
      failures++
      continue
    }
    const routes = extractRoutes(router)
    console.log(`\n=== ${name} (${prefixes[name]}) — ${routes.length} routes ===`)
    for (const r of routes) {
      const status = r.hasFn ? 'OK ' : 'BAD'
      const full = prefixes[name] + r.path
      console.log(
        `  [${status}] ${r.methods.join(',').padEnd(14)} ${full}  (${r.handlers} handler${r.handlers > 1 ? 's' : ''})`,
      )
      totalRoutes++
      if (!r.hasFn) failures++
    }
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`)
    failures++
  }
}

console.log(`\n--- Summary ---`)
console.log(`Total routes discovered: ${totalRoutes}`)
console.log(`Failures:                ${failures}`)
process.exit(failures === 0 ? 0 : 1)
