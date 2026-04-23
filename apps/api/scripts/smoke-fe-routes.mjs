// Cross-reference smoke: ensure every api.<method>('/path') call in apps/web
// resolves to a real mounted route in the API.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WEB_SRC = 'apps/web/src'
// From smoke-routes output:
const API_ROUTES = [
  ['GET', '/api/health/'],
  ['POST', '/api/auth/register'],
  ['POST', '/api/auth/login'],
  ['POST', '/api/auth/refresh'],
  ['POST', '/api/auth/verify-email'],
  ['POST', '/api/auth/resend-verification'],
  ['POST', '/api/auth/forgot-password'],
  ['POST', '/api/auth/reset-password'],
  ['GET', '/api/users/me'],
  ['PATCH', '/api/users/me'],
  ['DELETE', '/api/users/me'],
  ['GET', '/api/users/'],
  ['GET', '/api/users/:id'],
  ['PATCH', '/api/users/:id/role'],
  ['GET', '/api/breeders/me/profile'],
  ['PATCH', '/api/breeders/me'],
  ['POST', '/api/breeders/me/submit-verification'],
  ['POST', '/api/breeders/'],
  ['GET', '/api/breeders/:id'],
  ['POST', '/api/verification/upload'],
  ['GET', '/api/verification/my-docs'],
  ['DELETE', '/api/verification/:docId'],
  ['PATCH', '/api/verification/:docId/review'],
  ['GET', '/api/verification/:docId/view'],
  ['GET', '/api/search/stats'],
  ['GET', '/api/search/breeders'],
  ['GET', '/api/search/species'],
  ['GET', '/api/search/districts'],
  ['GET', '/api/search/districts/:districtId/municipalities'],
  ['GET', '/api/reviews/mine'],
  ['GET', '/api/reviews/about-me'],
  ['GET', '/api/reviews/'],
  ['GET', '/api/reviews/:id'],
  ['POST', '/api/reviews/'],
  ['PATCH', '/api/reviews/:id'],
  ['DELETE', '/api/reviews/:id'],
  ['POST', '/api/reviews/:id/reply'],
  ['POST', '/api/reviews/:id/flag'],
  ['PATCH', '/api/reviews/:id/moderate'],
  ['GET', '/api/reviews/:id/flags'],
  ['DELETE', '/api/reviews/:id/flags'],
  ['GET', '/api/messages/threads'],
  ['POST', '/api/messages/threads'],
  ['GET', '/api/messages/threads/:threadId'],
  ['POST', '/api/messages/threads/:threadId/messages'],
  ['PATCH', '/api/messages/threads/:threadId/read'],
  ['GET', '/api/messages/unread-count'],
  ['GET', '/api/admin/stats'],
  ['GET', '/api/admin/verifications/pending'],
  ['GET', '/api/admin/users'],
  ['PATCH', '/api/admin/users/:id/suspend'],
  ['GET', '/api/admin/breeders'],
  ['PATCH', '/api/admin/breeders/:id/status'],
  ['GET', '/api/admin/reviews/flagged'],
  ['GET', '/api/admin/audit-logs'],
]

function pathToRegex(p) {
  const escaped = p
    .replace(/\/$/, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/:[A-Za-z_]+/g, '[^/]+')
  return new RegExp('^' + escaped + '/?$')
}
const routeMatchers = API_ROUTES.map(([m, p]) => ({ method: m, regex: pathToRegex(p), raw: p }))

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const CALL_RE = /api\.(get|post|patch|put|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)/gi
// Normalise call paths: baseURL is '/api', so a call like '/reviews/mine' -> '/api/reviews/mine';
// if someone accidentally wrote '/api/...' it becomes '/api/api/...'.
function normalise(p) {
  // Strip query strings and anything after a ${} template placeholder (path param).
  let clean = p.split('?')[0]
  clean = clean.replace(/\$\{[^}]+\}/g, ':param')
  const withPrefix = clean.startsWith('/api/') ? '/api' + clean : '/api' + clean
  return withPrefix
}

const issues = []
let totalCalls = 0
for (const f of walk(WEB_SRC)) {
  const src = readFileSync(f, 'utf8')
  let m
  while ((m = CALL_RE.exec(src))) {
    totalCalls++
    const method = m[1].toUpperCase()
    const rawPath = m[2]
    const effective = normalise(rawPath)
    const hit = routeMatchers.find((r) => r.method === method && r.regex.test(effective))
    if (!hit) {
      issues.push({ file: f.replace(/\\/g, '/'), method, rawPath, effective })
    }
  }
}

console.log(`Scanned ${totalCalls} api.* calls in ${WEB_SRC}`)
if (issues.length === 0) {
  console.log('[OK] All frontend calls map to a real API route.')
  process.exit(0)
}
console.log(`[FAIL] ${issues.length} unmatched calls:`)
for (const i of issues) {
  console.log(`  ${i.method.padEnd(6)} ${i.rawPath}  (effective ${i.effective})  in ${i.file}`)
}
process.exit(1)
