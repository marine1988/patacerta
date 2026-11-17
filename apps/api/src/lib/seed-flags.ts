/**
 * Flags que controlam comportamento destrutivo do seed.
 *
 * PATA-BUG-13: o seed corria em cada boot com `RUN_SEED_ON_BOOT=true` e o
 * `update` do upsert do admin incluía `passwordHash`. Resultado: cada deploy
 * repunha a password do admin para o valor de `ADMIN_PASSWORD`, e qualquer
 * alteração feita em stage perdia-se sem aviso. O mesmo se aplicava aos
 * utilizadores demo.
 *
 * A password do admin passa a ser definida **só na criação**. Para forçar a
 * reposição (ex.: recuperar acesso depois de uma password perdida), liga-se
 * `RESET_ADMIN_PASSWORD_ON_BOOT=true` no ambiente — nunca por omissão.
 */

/** `true` ou `1` contam como ligado; tudo o resto (incluindo undefined) é desligado. */
export function isTruthyFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1'
}

/** A reposição da password do admin está explicitamente autorizada? */
export function shouldResetAdminPassword(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyFlag(env.RESET_ADMIN_PASSWORD_ON_BOOT)
}
