/**
 * Pequenos helpers de redaccao de PII para uso em logs e telemetria.
 *
 * Justificacao: queremos preservar utilidade de debug (operador consegue
 * cruzar logs de erro com tickets de suporte sem expor o endereco
 * completo num grep acidental ou num log shipper terceiro). Ao mesmo
 * tempo nao queremos um hash opaco que torne a triagem inviavel.
 *
 * O formato `u***@dominio.com` mantem o dominio (util para diagnosticar
 * problemas com SMTP por dominio) e a primeira letra do localpart
 * (suficiente para correlacionar com o utilizador certo apos
 * confirmacao por outro canal), mas elimina suficiente material para
 * que um leak destes logs nao constitua exposicao de PII no sentido
 * estrito do RGPD.
 */
export function maskEmail(email: string): string {
  if (!email || typeof email !== 'string') return '<invalid>'
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length === 1) return `*@${domain}`
  return `${local[0]}***@${domain}`
}
