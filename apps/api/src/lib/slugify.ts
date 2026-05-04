/**
 * Slugify pt-PT. Estratégia:
 * 1. Lowercase + Unicode NFD para separar acentos dos caracteres base.
 * 2. Remover marcas de combinação (acentos) — ASCII fold.
 * 3. Substituir tudo o que não seja [a-z0-9] por hífen.
 * 4. Colapsar hífens consecutivos e remover dos extremos.
 * 5. Truncar a `maxLength` (default 100) cortando num hífen para não
 *    deixar palavras truncadas quando possível.
 *
 * Não tenta ser tão agressivo como `slugify` do npm (que tem mappings
 * para "ã -> a", "ç -> c") porque o NFD + replace cobre os casos
 * comuns para português europeu sem dependências.
 *
 * Exemplos:
 *   "Quinta do Monte"          -> "quinta-do-monte"
 *   "Canil São João — Lisboa"  -> "canil-sao-joao-lisboa"
 *   "  Açores & Ilhas  "        -> "acores-ilhas"
 *   ""                          -> ""  (caller deve validar e fallback)
 */
export function slugify(input: string, maxLength = 100): string {
  if (!input) return ''
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remover acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (normalized.length <= maxLength) return normalized
  // Truncar mas tentar quebrar num hífen para evitar truncar palavras.
  const truncated = normalized.slice(0, maxLength)
  const lastDash = truncated.lastIndexOf('-')
  // Se o hífen está nos últimos 20% da string, corta lá; senão usa truncado bruto.
  if (lastDash > maxLength * 0.8) return truncated.slice(0, lastDash)
  return truncated.replace(/-$/, '')
}

/**
 * Resolve colisões pedindo ao caller uma função `exists(slug)` que
 * indica se já existe na BD. Tenta `base`, depois `base-2`, `base-3`, ...
 * até encontrar um livre. `maxAttempts` evita loop infinito (não é
 * suposto acontecer, mas defensivo).
 *
 * Em condições normais (criadores/serviços) `exists` é uma query
 * `prisma.breeder.findUnique({ where: { slug } })`. Em casos
 * concorrentes pode haver race condition (dois requests a tentar o
 * mesmo slug ao mesmo tempo); a constraint UNIQUE da BD é a defesa
 * final — se falhar, o caller apanha a P2002 do Prisma e re-tenta.
 */
export async function ensureUniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  if (!base) throw new Error('ensureUniqueSlug: base vazio')
  let candidate = base
  let attempt = 1
  while (await exists(candidate)) {
    attempt += 1
    candidate = `${base}-${attempt}`
    if (attempt > maxAttempts) {
      throw new Error(
        `ensureUniqueSlug: nao foi possivel gerar slug unico apos ${maxAttempts} tentativas (base="${base}")`,
      )
    }
  }
  return candidate
}

/**
 * Determina se um param de URL é numérico (ID) ou textual (slug).
 * Usado em rotas tipo `/breeders/:idOrSlug` para fazer dispatch.
 */
export function isNumericId(param: string): boolean {
  return /^\d+$/.test(param)
}
