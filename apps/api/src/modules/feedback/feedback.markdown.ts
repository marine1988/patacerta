// ============================================
// PataCerta — Feedback → Markdown (export admin)
// ============================================
//
// Geração pura e testável do ficheiro .md que o admin exporta para o Hermes.
// Sem I/O, sem Prisma: recebe a lista já ordenada (categoria asc, data desc)
// e devolve a string completa.

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

function formatDateUtc(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

function authorOf(item: FeedbackMarkdownItem): string {
  const uid = item.userId ?? item.user?.id
  if (item.user) {
    return `${item.user.firstName} ${item.user.lastName} (user #${uid ?? '?'})`
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
    const catEnum = item.category
    return [
      `## ${idx + 1} — [${catEnum}] ${item.title}`,
      '',
      `- **Data:** ${formatDateUtc(item.createdAt)}`,
      `- **Autor:** ${authorOf(item)}`,
      '',
      item.body,
    ].join('\n')
  })

  return `${header}${blocks.join('\n\n---\n\n')}\n`
}
