// ============================================
// PataCerta — Zod Schemas (Reviews)
// ============================================

import { z } from 'zod'

export const createReviewSchema = z.object({
  breederId: z.number().int().positive(),
  rating: z.number().int().min(1, 'Avaliação mínima: 1').max(5, 'Avaliação máxima: 5'),
  title: z.string().trim().min(3, 'Título deve ter pelo menos 3 caracteres').max(200),
  body: z.string().trim().max(2000).optional(),
})

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().max(2000).optional(),
})

export const replyToReviewSchema = z.object({
  reply: z.string().trim().min(1, 'Resposta não pode estar vazia').max(2000),
})

export const listReviewsSchema = z.object({
  breederId: z.coerce.number().int().positive().optional(),
  authorId: z.coerce.number().int().positive().optional(),
  status: z.enum(['PUBLISHED', 'HIDDEN', 'FLAGGED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['recent', 'oldest', 'highest', 'lowest']).default('recent'),
})

export const moderateReviewSchema = z.object({
  status: z.enum(['PUBLISHED', 'HIDDEN', 'FLAGGED']),
  reason: z.string().trim().max(500).optional(),
})

export const flagReviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Por favor descreva o motivo (mínimo 10 caracteres)')
    .max(500, 'Motivo demasiado longo (máximo 500 caracteres)'),
})

export type CreateReviewInput = z.infer<typeof createReviewSchema>
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>
export type ReplyToReviewInput = z.infer<typeof replyToReviewSchema>
export type ListReviewsInput = z.infer<typeof listReviewsSchema>
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>
export type FlagReviewInput = z.infer<typeof flagReviewSchema>
