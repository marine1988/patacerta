/**
 * Guard de tamanho do backup Postgres — AUDIT-OPS.md §3 OPS-08.
 *
 * O que aconteceu: a 2026-08-25 o `pg_dump` morreu a meio do pipeline, o `age`
 * fechou o header na mesma e o `mc pipe` gravou 200 B no bucket. O guard antigo
 * (`SIZE -lt 100`) aceitou, o objecto foi mirrorizado para o offsite e o
 * healthchecks pingou SUCESSO — um dia de backups "verde" sem conteudo.
 *
 * Este teste corre o script REAL (`apps/api/scripts/backup-postgres.sh`) contra
 * stubs de `pg_dump`/`age`/`mc`/`wget` no PATH. Os stubs gravam no MinIO falso o
 * que a pipeline lhes entrega, e o `mc stat` fake reporta o tamanho verdadeiro
 * desse ficheiro — logo o tamanho que o guard avalia e' o que a pipeline
 * produziu, nao um numero injectado a mao.
 *
 * A/B local (prova de que o teste apanha o bug):
 *   git show HEAD:apps/api/scripts/backup-postgres.sh > /tmp/backup-head.sh
 *   PATA_BACKUP_SCRIPT=/tmp/backup-head.sh pnpm --filter @patacerta/api test -- \
 *     backup-postgres-size-guard   # -> falha no caso de 200 B (exit 0 do HEAD)
 */
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

// Permite apontar a um script alternativo para o A/B local contra a versao de
// HEAD (ver cabeçalho). Em CI a env var nao existe -> testa o script do repo.
const SCRIPT =
  process.env.PATA_BACKUP_SCRIPT ??
  fileURLToPath(new URL('../../scripts/backup-postgres.sh', import.meta.url))

const HC_BASE = 'https://hc-ping.com/00000000-0000-0000-0000-000000000000'

/**
 * Stubs. Cada um faz o minimo que o script chama:
 *  - pg_dump: despeja o fixture (o "dump" de N bytes) para stdout
 *  - age: passthrough (a encriptacao real nao interessa ao guard)
 *  - mc: alias/mb no-op, pipe grava o stdin, stat reporta o tamanho do que foi gravado
 *  - wget: registra cada URL pedida (start / sucesso / fail do healthchecks)
 */
const STUBS: Record<string, string> = {
  pg_dump: `#!/bin/sh
cat "$STUB_DUMP_FIXTURE"
`,
  age: `#!/bin/sh
cat
`,
  mc: `#!/bin/sh
set -eu
cmd="$1"; shift
case "$cmd" in
  alias|mb) exit 0 ;;
  pipe) cat > "$STUB_DIR/object" ;;
  stat)
    if [ -f "$STUB_DIR/object" ]; then size=$(wc -c < "$STUB_DIR/object" | tr -d ' '); else size=0; fi
    printf '{"size":%s}\\n' "$size"
    ;;
  *) echo "mc stub: comando nao suportado: $cmd" >&2; exit 1 ;;
esac
`,
  wget: `#!/bin/sh
for a in "$@"; do
  case "$a" in http*) printf '%s\\n' "$a" >> "$STUB_DIR/hc-pings" ;; esac
done
exit 0
`,
}

interface RunResult {
  status: number
  stdout: string
  stderr: string
  pings: string[]
}

const tmpDirs: string[] = []

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  tmpDirs.length = 0
})

/** Corre o script real com um "dump" de `dumpBytes` bytes. */
function runBackup(dumpBytes: number): RunResult {
  const dir = mkdtempSync(join(tmpdir(), 'pata-backup-guard-'))
  tmpDirs.push(dir)

  const bin = join(dir, 'bin')
  mkdirSync(bin)
  for (const [name, body] of Object.entries(STUBS)) {
    const path = join(bin, name)
    writeFileSync(path, body)
    chmodSync(path, 0o755)
  }

  const fixture = join(dir, 'dump.bin')
  writeFileSync(fixture, Buffer.alloc(dumpBytes, 0x41))

  const result = spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'}`,
      STUB_DIR: dir,
      STUB_DUMP_FIXTURE: fixture,
      DATABASE_URL: 'postgresql://patacerta:fake@postgres:5432/patacerta?schema=public',
      AGE_RECIPIENT: 'age1testonlyrecipient',
      MINIO_ENDPOINT: 'minio',
      MINIO_PORT: '9000',
      MINIO_ACCESS_KEY: 'testaccesskey',
      MINIO_SECRET_KEY: 'testsecretkey',
      MINIO_BACKUP_BUCKET: 'patacerta-backups',
      HEALTHCHECKS_URL_BACKUP: HC_BASE,
    },
  })

  const pingFile = join(dir, 'hc-pings')
  const pings = existsSync(pingFile)
    ? readFileSync(pingFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    : []

  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr, pings }
}

// `sh` + stubs POSIX: em Windows (onde o repo tambem e' usado) nao ha' /bin/sh.
describe.skipIf(process.platform === 'win32')(
  'backup-postgres.sh — guard de tamanho do objecto',
  () => {
    it('rejeita o objecto de 200 B do incidente de 2026-08-25 e nao pinga sucesso', () => {
      const r = runBackup(200)

      expect(r.status).toBe(5)
      expect(r.stderr).toContain('200 bytes')
      expect(r.stderr).toContain('minimo 4096')
      expect(r.stdout).not.toContain('sucesso')
      // dead-man-switch: /start e /fail sim, ping de sucesso nao.
      expect(r.pings).toContain(`${HC_BASE}/start`)
      expect(r.pings).toContain(`${HC_BASE}/fail`)
      expect(r.pings).not.toContain(HC_BASE)
    })

    it('rejeita 4095 B (um byte abaixo do limite)', () => {
      const r = runBackup(4095)

      expect(r.status).toBe(5)
      expect(r.stderr).toContain('4095 bytes')
      expect(r.pings).not.toContain(HC_BASE)
    })

    it('aceita 4096 B (o limite e inclusivo)', () => {
      const r = runBackup(4096)

      expect(r.status).toBe(0)
      expect(r.stdout).toContain('4096 bytes')
      expect(r.pings).toContain(HC_BASE)
    })

    it('aceita um dump saudavel (153 568 B, a mediana medida no offsite) e registra o tamanho', () => {
      const r = runBackup(153_568)

      expect(r.status).toBe(0)
      expect(r.stdout).toContain('153568 bytes')
      expect(r.stdout).toContain('minimo 4096')
      expect(r.stdout).toContain('sucesso')
      expect(r.pings).toContain(HC_BASE)
      expect(r.pings).not.toContain(`${HC_BASE}/fail`)
    })
  },
)
