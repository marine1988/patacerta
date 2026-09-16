import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Origem canónica dos URLs absolutos publicados pela API (hoje o `<loc>` do
 * sitemap.xml). Regressão PATA-BUG-7: o stage servia um sitemap com URLs de
 * PRODUÇÃO porque `PUBLIC_URL` não estava definido e o código tinha um default
 * silencioso apontado a `https://patacerta.pt`.
 */

/** `process.env.X = undefined` escreve a string 'undefined' — não é o mesmo que apagar. */
function setEnv(key: 'PUBLIC_URL' | 'FRONTEND_URL' | 'NODE_ENV', value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

const ORIGINAL_ENV = {
  PUBLIC_URL: process.env.PUBLIC_URL,
  FRONTEND_URL: process.env.FRONTEND_URL,
  NODE_ENV: process.env.NODE_ENV,
}

/**
 * `isProd`/`isStage` são lidos em module-load, por isso cada caso carrega o
 * módulo depois de mexer nas env vars (senão o teste passava por acidente).
 */
async function loadEnvModule() {
  vi.resetModules()
  return import('./env.js')
}

beforeEach(() => {
  setEnv('PUBLIC_URL', undefined)
  setEnv('FRONTEND_URL', undefined)
})

afterEach(() => {
  setEnv('PUBLIC_URL', ORIGINAL_ENV.PUBLIC_URL)
  setEnv('FRONTEND_URL', ORIGINAL_ENV.FRONTEND_URL)
  setEnv('NODE_ENV', ORIGINAL_ENV.NODE_ENV)
  vi.resetModules()
})

describe('getPublicBaseUrl — resolução da origem canónica', () => {
  it('usa PUBLIC_URL e remove o trailing slash', async () => {
    setEnv('NODE_ENV', 'stage')
    setEnv('PUBLIC_URL', 'https://stage.patacerta.pt/')
    setEnv('FRONTEND_URL', 'https://outro.example.com')

    const { getPublicBaseUrl } = await loadEnvModule()
    expect(getPublicBaseUrl()).toBe('https://stage.patacerta.pt')
  })

  it('ignora PUBLIC_URL vazio (cai no FRONTEND_URL)', async () => {
    setEnv('NODE_ENV', 'stage')
    setEnv('PUBLIC_URL', '   ')
    setEnv('FRONTEND_URL', 'https://stage.patacerta.pt')

    const { getPublicBaseUrl } = await loadEnvModule()
    expect(getPublicBaseUrl()).toBe('https://stage.patacerta.pt')
  })

  // Regressão: `FRONTEND_URL` aceita lista separada por vírgulas (mesma
  // semântica de CORS_ORIGIN). Ler a env crua metia a lista inteira dentro de
  // um `<loc>` e produzia uma URL inválida no sitemap.
  it('sem PUBLIC_URL usa a PRIMEIRA entrada de um FRONTEND_URL com CSV', async () => {
    setEnv('NODE_ENV', 'stage')
    setEnv('FRONTEND_URL', 'https://stage.patacerta.pt,https://outro.example.com')

    const { getPublicBaseUrl } = await loadEnvModule()
    expect(getPublicBaseUrl()).toBe('https://stage.patacerta.pt')
  })

  // PATA-BUG-7 — o teste que falhava em stage.
  it('ambientes não-produção nunca herdam o domínio de produção', async () => {
    setEnv('NODE_ENV', 'stage')
    setEnv('FRONTEND_URL', 'https://stage.patacerta.pt')

    const { getPublicBaseUrl } = await loadEnvModule()
    expect(getPublicBaseUrl()).not.toBe('https://patacerta.pt')
  })

  // Fail-loud: sem NENHUMA das duas, em prod/stage preferimos rebentar a
  // request (500 com log) a publicar silenciosamente o host errado.
  it.each(['production', 'stage'])(
    'lança em NODE_ENV=%s quando falta PUBLIC_URL e FRONTEND_URL',
    async (nodeEnv) => {
      setEnv('NODE_ENV', nodeEnv)

      const { getPublicBaseUrl } = await loadEnvModule()
      expect(() => getPublicBaseUrl()).toThrow(/FRONTEND_URL nao definido/)
    },
  )

  it('em desenvolvimento cai em localhost (contrato de getFrontendBaseUrl)', async () => {
    setEnv('NODE_ENV', 'development')

    const { getPublicBaseUrl } = await loadEnvModule()
    expect(getPublicBaseUrl()).toBe('http://localhost:5173')
  })
})
