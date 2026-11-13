/**
 * Catálogo de raças — imagens do simulador.
 *
 * Garante que:
 *  1. todas as raças têm `imageUrl` **local** (`/breeds/<slug>.jpg`), exceto a
 *     única sem imagem livre conhecida (Cão do Barrocal Algarvio);
 *  2. cada imagem referida é realmente servida (200 + `image/*`).
 *
 * Read-only — seguro em produção (`@prod-safe`).
 *
 * Porque existe: 39 raças apontavam para hotlinks externos (dog.ceo/Unsplash)
 * sem licença garantida, e duas dessas URLs já devolviam 404 (akita-inu,
 * poodle-medio). O simulador mostrava a silhueta nessas raças sem que nada
 * falhasse. Ver `docs/BREED_IMAGES.md`.
 */
import { test, expect } from '../fixtures/test'
import type { APIRequestContext } from '@playwright/test'
import { API_BASE_URL } from '../fixtures/demo-data'
import { BASE_URL } from '../fixtures/env'

interface BreedItem {
  id: number
  nameSlug: string
  namePt: string
  imageUrl: string | null
}

/** Única raça sem imagem livre em repositório público (ver docs/BREED_IMAGES.md). */
const SEM_IMAGEM_CONHECIDA = 'cao-do-barrocal-algarvio'

async function fetchBreeds(request: APIRequestContext): Promise<BreedItem[]> {
  const res = await request.get(`${API_BASE_URL}/breeds`)
  expect(res.status(), 'GET /api/breeds').toBe(200)
  return (await res.json()) as BreedItem[]
}

test.describe('Imagens do catálogo de raças @prod-safe', () => {
  test('todas as raças têm imageUrl local, exceto a sem imagem conhecida', async ({ request }) => {
    const breeds = await fetchBreeds(request)
    expect(breeds.length, 'catálogo tem raças').toBeGreaterThan(90)

    const semImagem = breeds.filter((b) => !b.imageUrl).map((b) => b.nameSlug)
    expect(semImagem, 'só a raça sem imagem livre conhecida pode estar sem imageUrl').toEqual([
      SEM_IMAGEM_CONHECIDA,
    ])

    const externas = breeds
      .filter((b) => b.imageUrl && !b.imageUrl.startsWith('/breeds/'))
      .map((b) => `${b.nameSlug} -> ${b.imageUrl}`)
    expect(externas, 'nenhuma raça pode depender de hotlink externo').toEqual([])
  })

  test('todas as imagens referidas são servidas (200 + image/*)', async ({ request }) => {
    const breeds = await fetchBreeds(request)
    const comImagem = breeds.filter((b) => b.imageUrl) as (BreedItem & { imageUrl: string })[]
    expect(comImagem.length).toBeGreaterThan(90)

    const falhas: string[] = []
    // Lotes de 10 para não saturar o rate-limit do alvo.
    for (let i = 0; i < comImagem.length; i += 10) {
      const lote = comImagem.slice(i, i + 10)
      const resultados = await Promise.all(
        lote.map(async (b) => {
          const res = await request.get(`${BASE_URL}${b.imageUrl}`)
          const ct = res.headers()['content-type'] ?? ''
          const ok = res.status() === 200 && ct.startsWith('image/')
          return ok ? null : `${b.nameSlug} -> ${res.status()} ${ct || '(sem content-type)'}`
        }),
      )
      falhas.push(...resultados.filter((x): x is string => x !== null))
    }

    expect(falhas, 'imagens em falta ou com content-type errado').toEqual([])
  })
})
