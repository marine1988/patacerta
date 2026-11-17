/**
 * PATA-BUG-13 — a password do admin não pode ser reposta a cada boot.
 *
 * O seed corre em cada arranque quando `RUN_SEED_ON_BOOT=true` (é o caso em
 * stage). Se o `update` do upsert levar `passwordHash`, qualquer alteração de
 * password feita pelo utilizador desaparece no deploy seguinte. A reposição só
 * acontece quando `RESET_ADMIN_PASSWORD_ON_BOOT` está explicitamente ligada.
 */

import { describe, it, expect } from 'vitest'
import { isTruthyFlag, shouldResetAdminPassword } from './seed-flags.js'

describe('isTruthyFlag', () => {
  it("aceita 'true' e '1'", () => {
    expect(isTruthyFlag('true')).toBe(true)
    expect(isTruthyFlag('1')).toBe(true)
  })

  it('recusa tudo o resto', () => {
    for (const v of ['false', '0', '', 'TRUE', 'yes', 'on', undefined]) {
      expect(isTruthyFlag(v), `valor: ${String(v)}`).toBe(false)
    }
  })
})

describe('shouldResetAdminPassword', () => {
  it('está desligado por omissão — a password do admin é preservada', () => {
    expect(shouldResetAdminPassword({})).toBe(false)
  })

  it('está desligado com valores falsos explícitos', () => {
    expect(shouldResetAdminPassword({ RESET_ADMIN_PASSWORD_ON_BOOT: 'false' })).toBe(false)
    expect(shouldResetAdminPassword({ RESET_ADMIN_PASSWORD_ON_BOOT: '0' })).toBe(false)
  })

  it('liga com true ou 1', () => {
    expect(shouldResetAdminPassword({ RESET_ADMIN_PASSWORD_ON_BOOT: 'true' })).toBe(true)
    expect(shouldResetAdminPassword({ RESET_ADMIN_PASSWORD_ON_BOOT: '1' })).toBe(true)
  })
})
