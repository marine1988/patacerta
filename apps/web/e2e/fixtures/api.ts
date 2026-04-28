import type { APIRequestContext } from '@playwright/test'
import { API_BASE_URL } from './demo-data'

export interface BreederCard {
  id: number
  businessName: string
  district?: { name: string }
}

export interface ServiceCard {
  id: number
  title: string
  category?: { name: string }
}

/**
 * Devolve o primeiro breeder publicado retornado pela API de pesquisa.
 * Se nenhum breeder existir, lança erro (sinal claro que as seeds não correram).
 */
export async function getFirstBreeder(request: APIRequestContext): Promise<BreederCard> {
  const res = await request.get(`${API_BASE_URL}/breeders?limit=1`)
  if (!res.ok()) throw new Error(`GET /breeders falhou: ${res.status()}`)
  const json = (await res.json()) as { data?: BreederCard[]; items?: BreederCard[] }
  const list = json.data ?? json.items ?? []
  const first = list[0]
  if (!first) throw new Error('Nenhum breeder retornado pela API — seeds demo não correram?')
  return first
}

export async function getFirstService(request: APIRequestContext): Promise<ServiceCard> {
  const res = await request.get(`${API_BASE_URL}/services?limit=1`)
  if (!res.ok()) throw new Error(`GET /services falhou: ${res.status()}`)
  const json = (await res.json()) as { data?: ServiceCard[]; items?: ServiceCard[] }
  const list = json.data ?? json.items ?? []
  const first = list[0]
  if (!first) throw new Error('Nenhum serviço retornado pela API — seeds demo não correram?')
  return first
}
