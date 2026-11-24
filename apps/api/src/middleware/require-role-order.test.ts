/**
 * SEC-09 — guard estático da ordem dos middlewares de autenticação.
 *
 * `requireRole` só é fiável se o `role` já tiver sido re-lido da BD por
 * `requireActiveUser` (o JWT pode ter até 15 min de desactualização). Em vez
 * de confiar na revisão humana, este teste lê os routers e falha se qualquer
 * `requireRole(` aparecer numa cadeia sem `requireActiveUser` antes dele, ou
 * fora da ordem `requireAuth` → `requireActiveUser` → `requireRole`.
 *
 * Não é um teste de comportamento (esse está em `auth.role.test.ts`): é o
 * alarme para quando alguém acrescenta uma rota admin nova e se esquece de um
 * dos guards.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const modulesDir = join(here, '..', 'modules')

/** Início de uma declaração de rota: `xxxRouter.get(`, `.use(`, etc. */
const ROUTE_START = /\n[A-Za-z][A-Za-z0-9]*Router\s*\.\s*(?:use|get|post|patch|put|delete)\s*\(/g

function listRouterFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listRouterFiles(full))
    else if (entry.name.endsWith('.router.ts')) out.push(full)
  }
  return out.sort()
}

/** Remove comentários de linha para não confundir documentação com código. */
function stripLineComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//')
      return idx === -1 ? line : line.slice(0, idx)
    })
    .join('\n')
}

/** Índice do início da declaração de rota que contém `index`. */
function statementStart(source: string, index: number): number {
  const re = new RegExp(ROUTE_START.source, 'g')
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    if (match.index >= index) break
    last = match.index
  }
  return last
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

describe('ordem dos guards de autenticação nos routers', () => {
  const files = listRouterFiles(modulesDir)

  it('encontra os routers do projeto', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  it('há usos de requireRole para validar (o teste não passa por vacuidade)', () => {
    const total = files.reduce((acc, file) => {
      const source = stripLineComments(readFileSync(file, 'utf8'))
      return acc + [...source.matchAll(/\brequireRole\s*\(/g)].length
    }, 0)

    expect(total).toBeGreaterThanOrEqual(10)
  })

  for (const file of files) {
    const name = relative(join(here, '..', '..'), file)
    const source = stripLineComments(readFileSync(file, 'utf8'))
    const occurrences = [...source.matchAll(/\brequireRole\s*\(/g)]
    if (occurrences.length === 0) continue

    it(`${name}: requireAuth → requireActiveUser → requireRole em todas as cadeias`, () => {
      for (const occurrence of occurrences) {
        const index = occurrence.index ?? 0
        // Inclui o próprio `requireRole(` no recorte para as comparações de
        // posição fazerem sentido (senão `indexOf` devolve -1).
        const end = index + 'requireRole('.length
        const chain = source.slice(statementStart(source, index), end)
        const where = `${name}:${lineOf(source, index)}`

        expect(chain, `${where} — requireRole sem requireActiveUser antes`).toContain(
          'requireActiveUser',
        )
        expect(chain, `${where} — requireRole sem requireAuth antes`).toContain('requireAuth')
        expect(
          chain.indexOf('requireAuth'),
          `${where} — requireAuth depois de requireActiveUser`,
        ).toBeLessThan(chain.indexOf('requireActiveUser'))
        expect(
          chain.indexOf('requireActiveUser'),
          `${where} — requireActiveUser depois de requireRole`,
        ).toBeLessThan(chain.indexOf('requireRole'))
      }
    })
  }
})
