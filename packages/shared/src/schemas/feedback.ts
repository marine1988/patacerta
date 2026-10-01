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
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['recent', 'votes']).default('votes'),
})

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
export type ListFeedbackInput = z.infer<typeof listFeedbackSchema>
