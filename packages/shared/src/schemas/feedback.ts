// ============================================
// PataCerta — Zod Schemas (Feedback)
// ============================================

import { z } from 'zod'

export const feedbackCategorySchema = z.enum(['BUG', 'SUGESTAO', 'MELHORIA', 'OUTRO'])

export const createFeedbackSchema = z.object({
  category: feedbackCategorySchema,
  title: z.string().trim().min(5, 'Título deve ter pelo menos 5 caracteres').max(200),
  body: z.string().trim().min(20, 'Feedback deve ter pelo menos 20 caracteres').max(5000),
})

export const listFeedbackSchema = z.object({
  category: feedbackCategorySchema.optional(),
  // `skip = (page - 1) * limit` (feedback.controller.ts) alimenta o OFFSET do
  // Prisma: sem bound, um `page` gigante vira erro de validação do Prisma e
  // devolve 500 em vez de 400 (SEC-05). 10000 × limit 50 = 500k linhas, muito
  // acima do catálogo real.
  page: z.coerce.number().int().positive().max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['recent', 'votes']).optional().default('recent'),
})

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
export type ListFeedbackInput = z.infer<typeof listFeedbackSchema>
