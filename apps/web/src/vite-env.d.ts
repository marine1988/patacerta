/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /**
   * Google AdSense publisher ID, ex: "ca-pub-1234567890123456".
   * Quando vazio (default), os slots de anúncio não renderizam nada
   * — útil para dev/PR previews onde não queremos chamar o Google.
   */
  readonly VITE_ADSENSE_CLIENT_ID?: string
  /**
   * Activa renderização de AdSlot. Aceita "true"/"1". Default: false.
   * Dev/stage normalmente fica off; só prod liga depois de a conta
   * AdSense estar aprovada e o domínio verificado.
   */
  readonly VITE_ADSENSE_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
