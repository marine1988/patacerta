import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Regressão PATA-C1: os escape hatches de produção (ALLOW_*_IN_PROD) têm de
 * estar DESLIGADOS por omissão. Se o fallback voltar a `:-1`, um deploy sem a
 * variável no painel Dokploy arranca com o gate de segurança neutralizado.
 *
 * Lê os compose de produção directamente do disco (relativo a este ficheiro)
 * para que o teste falhe no CI/local se alguém reverter o default.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const PROD_COMPOSES = ['docker-compose.dokploy.yml', 'docker-compose.coolify.yml']

const VARS = ['ALLOW_NO_SMTP_IN_PROD', 'ALLOW_INSECURE_FLAGS_IN_PROD']

function readCompose(name: string): string | null {
  try {
    return readFileSync(resolve(REPO_ROOT, name), 'utf8')
  } catch {
    return null
  }
}

function fallbackFor(content: string, varName: string): string | null {
  // Procura a linha `VAR: ${VAR:-X}` (interpolação do compose).
  const re = new RegExp(`${varName}:\\s*\\$\\{${varName}:-(\\d+)\\}`)
  const m = content.match(re)
  return m ? m[1] : null
}

describe('PATA-C1 — escape hatches de produção desligados por omissão', () => {
  it('docker-compose.dokploy.yml existe e define as duas variáveis', () => {
    const content = readCompose('docker-compose.dokploy.yml')
    expect(content).not.toBeNull()
    for (const v of VARS) {
      expect(fallbackFor(content!, v)).not.toBeNull()
    }
  })

  for (const compose of PROD_COMPOSES) {
    describe(compose, () => {
      const content = readCompose(compose)
      if (content === null) {
        it.skip('ficheiro ausente — ignorado', () => {})
        return
      }

      for (const v of VARS) {
        it(`${v} tem fallback :-0 (seguro)`, () => {
          const fb = fallbackFor(content, v)
          if (fb === null) {
            // Compose sem esta var: nada a validar (não tem :-1, OK).
            return
          }
          expect(fb).toBe('0')
        })
      }

      it('nenhuma das duas variáveis usa fallback :-1 (inseguro)', () => {
        for (const v of VARS) {
          const fb = fallbackFor(content, v)
          // Se a var não estiver presente, não é o caso ":-1" — mas o teste
          // acima já exige presença no dokploy; aqui só garantimos que não é 1.
          if (fb !== null) {
            expect(fb).not.toBe('1')
          }
        }
      })
    })
  }

  it('nenhum compose de produção tem :-1 nessas variáveis', () => {
    for (const compose of PROD_COMPOSES) {
      const content = readCompose(compose)
      if (!content) continue
      for (const v of VARS) {
        const re = new RegExp(`${v}:\\s*\\$\\{${v}:-(\\d+)\\}`)
        const m = content.match(re)
        if (m) {
          expect(m[1], `${compose} ${v} fallback ${m[1]}`).not.toBe('1')
        }
      }
    }
  })
})
