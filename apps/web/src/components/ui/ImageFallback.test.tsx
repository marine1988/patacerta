// @vitest-environment jsdom
/**
 * Testes do empty state de imagens (`ImageFallback`).
 *
 * Porque e' que este ficheiro pede jsdom: o caminho que mais interessa
 * (`onError` da <img> → placeholder) so' existe num DOM real — o React so'
 * chama o handler depois de o browser falhar o carregamento. O resto dos
 * asserts usa `renderToStaticMarkup` (sem DOM), mas o ambiente e' partilhado.
 *
 * Nota deliberada sobre o caso "URL existe mas devolve HTML/404/timeout":
 * o browser dispara `error` em todos eles (MIME invalido, 404, abort), logo
 * o caminho a testar e' exactamente o mesmo `onError` exercitado aqui. A
 * prova end-to-end (pedido abortado a sério) está no spec Playwright
 * `e2e/specs/image-fallback.spec.ts`.
 */
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ImageFallback } from './ImageFallback'

function markup(props: Parameters<typeof ImageFallback>[0]): string {
  return renderToStaticMarkup(<ImageFallback {...props} />)
}

describe('ImageFallback — empty state editorial', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('sem `src` mostra o fallback e nao cria <img> (zero requests)', () => {
    const html = markup({ alt: 'Pet sitting em Gaia', variant: 'service' })
    expect(html).toContain('data-testid="image-fallback"')
    expect(html).toContain('data-variant="service"')
    expect(html).not.toContain('<img')
  })

  it('`src` vazio conta como ausente', () => {
    const html = markup({ src: '', alt: 'Sem foto' })
    expect(html).toContain('data-testid="image-fallback"')
    expect(html).not.toContain('<img')
  })

  it('com `src` valido renderiza <img> object-cover e nenhum fallback', () => {
    const html = markup({ src: 'https://cdn.example/foto.jpg', alt: 'Titulo' })
    expect(html).toContain('<img')
    expect(html).toContain('object-cover')
    expect(html).not.toContain('data-testid="image-fallback"')
  })

  it('renderiza a microcopy e compoe o aria-label com o alt', () => {
    const html = markup({ alt: 'Passeio em Matosinhos', label: 'Sem fotografia' })
    expect(html).toContain('Sem fotografia')
    expect(html).toContain('aria-label="Passeio em Matosinhos — Sem fotografia"')
    expect(html).toContain('role="img"')
    // Nunca linguagem de erro no empty state.
    expect(html.toLowerCase()).not.toContain('erro')
  })

  it('propaga `data-variant`/`data-size` (card vs compact)', () => {
    expect(markup({ alt: 'x', variant: 'breed' })).toContain('data-size="card"')
    expect(markup({ alt: 'x', variant: 'breed', size: 'compact' })).toContain('data-size="compact"')
    expect(markup({ alt: 'x', variant: 'breeder' })).toContain('data-variant="breeder"')
  })

  it('usa um aria-label default quando nao ha alt nem label (nunca vazio)', () => {
    const html = markup({ alt: '', variant: 'service' })
    expect(html).toContain('aria-label="Imagem ilustrativa de um serviço"')
  })

  it('`decorative` esconde o empty state das tecnologias de apoio', () => {
    const html = markup({ alt: '', decorative: true })
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role="img"')
  })

  it('onError da <img> troca para o fallback (404/HTML/timeout)', async () => {
    await act(async () => {
      root.render(<ImageFallback src="https://cdn.example/foto-que-nao-existe.jpg" alt="Foto" />)
    })

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(container.querySelector('[data-testid="image-fallback"]')).toBeNull()

    // O browser dispara `error` para 404, MIME invalido (HTML) e abort.
    await act(async () => {
      img!.dispatchEvent(new Event('error', { bubbles: true }))
    })

    const fallback = container.querySelector('[data-testid="image-fallback"]')
    expect(fallback).not.toBeNull()
    expect(fallback?.getAttribute('aria-label')).toBe('Foto')
    // A <img> partida sai do DOM — nao fica o icone de imagem quebrada.
    expect(container.querySelector('img')).toBeNull()
  })

  it('onLoad da <img> continua a chegar ao caller (spinner/opacidade)', async () => {
    let loaded = 0
    await act(async () => {
      root.render(
        <ImageFallback src="https://cdn.example/ok.jpg" alt="Foto" onLoad={() => (loaded += 1)} />,
      )
    })

    await act(async () => {
      container.querySelector('img')!.dispatchEvent(new Event('load', { bubbles: true }))
    })

    expect(loaded).toBe(1)
  })
})
