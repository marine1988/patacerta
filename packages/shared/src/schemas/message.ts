// ============================================
// PataCerta — Zod Schemas (Messaging)
// ============================================

import { z } from 'zod'

export const createThreadSchema = z.object({
  breederId: z.number().int().positive(),
  subject: z.string().trim().min(1, 'Assunto obrigatório').max(200),
  body: z.string().trim().min(1, 'Mensagem não pode estar vazia').max(5000),
})

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mensagem não pode estar vazia').max(5000),
})

export const listThreadsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const listThreadMessagesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateThreadInput = z.infer<typeof createThreadSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type ListThreadsInput = z.infer<typeof listThreadsSchema>
export type ListThreadMessagesInput = z.infer<typeof listThreadMessagesSchema>
