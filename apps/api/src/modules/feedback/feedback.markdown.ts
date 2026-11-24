// ============================================
// PataCerta — Feedback → Markdown (export admin)
// ============================================
//
// Geração pura e testável do ficheiro .md que o admin exporta para o Hermes.
// Sem I/O, sem Prisma: recebe a lista já ordenada (categoria asc, data desc)
// e devolve a string completa.
//
// SEGURANÇA (SEC-02) — título, nome do autor e corpo são conteúdo de
// utilizador, e o destino é (a) um agente automático com o shell do operador e
// (b) potencialmente um preview Markdown (GitHub/GitLab/IDE). Sem neutralização
// um título com `\n---\n## Instruções…` forja cabeçalhos e regras horizontais, o
// `<img>` funciona como beacon e o corpo injeta tabelas alternativas às
// contagens do cabeçalho. Regras aplicadas:
//
//   1. Campos de uma linha (título, nome do autor) → `escapeInlineMarkdown`:
//      newlines colapsados (impede `##`/`---` forjados), HTML escapado e
//      `[`/`]`/`!` neutralizados (impede links/imagens Markdown, que disparam
//      pedidos no render). O título vive num cabeçalho e nunca numa tabela, por
//      isso o `|` é inerte e não é tocado.
//   2. Corpo (texto livre multi-linha) → `fencedBody`: bloco de código cercado
//      com cerca SEMPRE mais longa do que a maior sequência de backticks do
//      corpo, logo o conteúdo não consegue fechar o bloco. Dentro do fence
//      `##`, `---`, tabelas e HTML são literais. O texto original mantém-se
//      verbatim (requisito de produto).
//
// Invariantes garantidas (asseridas em feedback.markdown.test.ts): uma entrada
// = exactamente um cabeçalho `## `; nenhuma `---` fora da estrutura; nenhum
// HTML activo fora do bloco de código.

export interface FeedbackMarkdownUser {
  id?: number
  firstName: string
  lastName: string
}

export interface FeedbackMarkdownItem {
  id: number
  userId?: number
  category: string
  title: string
  body: string
  createdAt: Date | string
  user?: FeedbackMarkdownUser | null
}

const CATEGORY_DISPLAY: Record<string, string> = {
  BUG: 'Bug',
  SUGESTAO: 'Sugestão',
  MELHORIA: 'Melhoria',
  OUTRO: 'Outro',
}

const CATEGORY_ORDER = ['BUG', 'SUGESTAO', 'MELHORIA', 'OUTRO'] as const

const INLINE_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '[': '\\[',
  ']': '\\]',
  '!': '\\!',
}

/**
 * Neutraliza texto de utilizador que vai ocupar uma única linha de Markdown
 * (cabeçalho de entrada, nome do autor). Preserva o conteúdo legível — só
 * elimina caracteres com efeito estrutural.
 */
export function escapeInlineMarkdown(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[&<>\[\]!]/g, (ch) => INLINE_ESCAPES[ch] ?? ch)
    .trim()
}

/**
 * Embrulha texto livre num bloco de código cercado que o próprio conteúdo não
 * consegue fechar: a cerca tem sempre mais backticks do que a maior sequência
 * existente no texto. O corpo é preservado verbatim (excepto newlines finais).
 */
export function fencedBody(body: string): string {
  const longestRun = (body.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  const content = body.replace(/[\r\n]+$/, '')
  return `${fence}text\n${content}\n${fence}`
}

function formatDateUtc(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function authorOf(item: FeedbackMarkdownItem): string {
  const uid = item.userId ?? item.user?.id
  if (item.user) {
    const name = escapeInlineMarkdown(`${item.user.firstName} ${item.user.lastName}`)
    return `${name} (user #${uid ?? '?'})`
  }
  return `utilizador removido (#${uid ?? '?'})`
}

export function buildFeedbackMarkdown(
  items: FeedbackMarkdownItem[],
  exportedAt: Date | string = new Date(),
): string {
  const exportedIso =
    exportedAt instanceof Date ? exportedAt.toISOString() : new Date(exportedAt).toISOString()

  const counts = CATEGORY_ORDER.map((cat) => ({
    cat,
    display: CATEGORY_DISPLAY[cat],
    count: items.filter((it) => it.category === cat).length,
  }))

  const catWidth = Math.max('Categoria'.length, ...counts.map((c) => c.display.length))
  const entWidth = Math.max('Entradas'.length, ...counts.map((c) => String(c.count).length))

  const tableLines = [
    `| ${'Categoria'.padEnd(catWidth)} | ${'Entradas'.padEnd(entWidth)} |`,
    `| ${'-'.repeat(catWidth)} | ${'-'.repeat(entWidth)} |`,
    ...counts.map((c) => `| ${c.display.padEnd(catWidth)} | ${String(c.count).padEnd(entWidth)} |`),
  ]

  const header =
    [
      '# PataCerta — feedback dos utilizadores',
      '',
      `Exportado em ${exportedIso} · ${items.length} entradas`,
      '',
      ...tableLines,
      '',
      '> Ficheiro gerado automaticamente para análise. Cada entrada preserva o texto original do',
      '> utilizador. O autor é identificado por nome e id (sem email).',
      '',
      '---',
      '',
    ].join('\n') + '\n'

  if (items.length === 0) {
    return `${header}_Sem feedback registado._\n`
  }

  const blocks = items.map((item, idx) => {
    const catEnum = escapeInlineMarkdown(item.category)
    return [
      `## ${idx + 1} — [${catEnum}] ${escapeInlineMarkdown(item.title)}`,
      '',
      `- **Data:** ${formatDateUtc(item.createdAt)}`,
      `- **Autor:** ${authorOf(item)}`,
      '',
      fencedBody(item.body),
    ].join('\n')
  })

  return `${header}${blocks.join('\n\n---\n\n')}\n`
}
