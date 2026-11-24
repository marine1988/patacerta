// ============================================
// PataCerta — .gitignore cobre ficheiros .env de ambiente (SEC-07)
// ============================================
//
// Antes da correção `.env.prod`, `.env.dev` e `.env.development` NÃO eram
// ignorados: um operador que criasse `.env.prod` com segredos reais via o
// ficheiro aparecer como untracked normal e qualquer `git add` de diretório
// apanhava-o. Este teste usa a mesma ferramenta que um humano usaria
// (`git check-ignore`) para que a regra não regresse em silêncio.
//
// Corre apenas dentro de um work tree git; num tarball (sem .git) faz skip.

import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

function repoRoot(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: here,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const root = repoRoot()

function isIgnored(path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '--no-index', '-q', '--', path], {
      cwd: root as string,
      stdio: 'ignore',
    })
    return true
  } catch (error) {
    const status = (error as { status?: number }).status
    // 1 = "não ignorado" (o que queremos medir); qualquer outro código é falha real.
    if (status === 1) return false
    throw error
  }
}

describe.skipIf(!root)('.gitignore — ficheiros .env', () => {
  const mustBeIgnored = [
    '.env',
    '.env.local',
    '.env.prod',
    '.env.dev',
    '.env.development',
    '.env.test',
    '.env.stage',
    '.env.production',
    '.env.local.bak',
  ]

  it.each(mustBeIgnored)('ignora %s', (file) => {
    expect(isIgnored(file)).toBe(true)
  })

  const mustStayTracked = ['.env.example', '.env.prod.example', '.env.stage.example']

  it.each(mustStayTracked)('não ignora o exemplo %s', (file) => {
    expect(isIgnored(file)).toBe(false)
  })

  it('os ficheiros .env de exemplo continuam versionados', () => {
    for (const file of mustStayTracked) {
      const tracked = execFileSync('git', ['ls-files', '--error-unmatch', '--', file], {
        cwd: root as string,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      expect(tracked).toBe(file)
    }
  })
})
