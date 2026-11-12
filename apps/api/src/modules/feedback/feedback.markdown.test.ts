import { describe, it, expect } from 'vitest'
import { buildFeedbackMarkdown } from './feedback.markdown.js'

describe('buildFeedbackMarkdown', () => {
  it('lista vazia contem _Sem feedback registado._', () => {
    const md = buildFeedbackMarkdown([], new Date('2026-11-12T01:30:00.000Z'))
    expect(md).toContain('_Sem feedback registado._')
    expect(md).toContain('Exportado em 2026-11-12T01:30:00.000Z · 0 entradas')
  })

  it('duas entradas: ordem, tabela de contagens e cabecalhos correctos', () => {
    const items = [
      {
        id: 1,
        userId: 42,
        category: 'BUG',
        title: 'Título do feedback',
        body: 'Corpo do feedback, exactamente como foi escrito.',
        createdAt: new Date('2026-11-10T14:32:00.000Z'),
        user: { firstName: 'Ana', lastName: 'Silva' },
      },
      {
        id: 2,
        userId: 7,
        category: 'SUGESTAO',
        title: 'Outra sugestão',
        body: 'Corpo 2.',
        createdAt: new Date('2026-11-11T09:00:00.000Z'),
        user: { firstName: 'João', lastName: 'Costa' },
      },
    ]
    const md = buildFeedbackMarkdown(items, '2026-11-12T01:30:00.000Z')
    expect(md).toContain('## 1 — [BUG] Título do feedback')
    expect(md).toContain('## 2 — [SUGESTAO] Outra sugestão')
    expect(md).toContain('- **Data:** 2026-11-10 14:32')
    expect(md).toContain('- **Autor:** Ana Silva (user #42)')
    expect(md).toContain('Corpo do feedback, exactamente como foi escrito.')
    expect(md).toContain('| Bug       | 1        |')
    expect(md).toContain('| Sugestão  | 1        |')
  })
})
