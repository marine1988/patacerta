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

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'Mensagem não pode estar vazia').max(5000),
})

export const reportMessageSchema = z.object({
  reason: z.string().trim().min(10, 'Descreva o motivo com pelo menos 10 caracteres').max(500),
})

export const resolveReportSchema = z.object({
  action: z.enum(['RESOLVED', 'DISMISSED']),
  resolution: z.string().trim().max(500).optional(),
})

export const listThreadsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
})

export const listThreadMessagesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const searchMessagesSchema = z.object({
  q: z.string().trim().min(2, 'Pesquisa deve ter pelo menos 2 caracteres').max(200),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/** Edit/delete allowed within this window (minutes) after sending. Shared between client + server. */
export const MESSAGE_EDIT_WINDOW_MINUTES = 15

export type CreateThreadInput = z.infer<typeof createThreadSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type EditMessageInput = z.infer<typeof editMessageSchema>
export type ReportMessageInput = z.infer<typeof reportMessageSchema>
export type ResolveReportInput = z.infer<typeof resolveReportSchema>
export type ListThreadsInput = z.infer<typeof listThreadsSchema>
export type ListThreadMessagesInput = z.infer<typeof listThreadMessagesSchema>
export type SearchMessagesInput = z.infer<typeof searchMessagesSchema>
