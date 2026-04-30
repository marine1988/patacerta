// ============================================
// PataCerta — AdSense slot IDs
// ============================================
//
// Mapa central dos slot IDs criados no painel AdSense. Quando criarmos
// novos slots no painel do Google, é só substituir aqui — o ID é o
// `data-ad-slot` que aparece no snippet gerado.
//
// Mantemos os IDs em código (não em env vars) porque são públicos por
// natureza (vão para o HTML) e queremos versioná-los junto com o sítio
// onde estão a ser usados.
//
// Enquanto a conta AdSense não estiver aprovada, deixamos placeholders
// vazios; o componente <AdSlot> tolera string vazia e não renderiza.

export const AD_SLOTS = {
  /** Banner mid-page entre hero e secção de criadores em destaque. */
  homepageMid: '',
  /** Inline na sidebar/conteúdo da página de detalhe de criador. */
  breederDetail: '',
  /** Inline na sidebar/conteúdo da página de detalhe de serviço. */
  serviceDetail: '',
} as const

export type AdSlotKey = keyof typeof AD_SLOTS
