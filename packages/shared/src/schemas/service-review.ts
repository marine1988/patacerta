// ============================================
// PataCerta — Zod Schemas (Service Reviews)
// ============================================

import { z } from 'zod'

export const createServiceReviewSchema = z.object({
  serviceId: z.number().int().positive(),
  rating: z.number().int().min(1, 'Avaliação mínima: 1').max(5, 'Avaliação máxima: 5'),
  title: z.string().trim().min(3, 'Título deve ter pelo menos 3 caracteres').max(200),
  body: z.string().trim().max(2000).optional(),
})

export const updateServiceReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().min(3).max(200).optional(),
  body: z.string().trim().max(2000).optional(),
})

export const replyToServiceReviewSchema = z.object({
  reply: z.string().trim().min(1, 'Resposta não pode estar vazia').max(2000),
})

export const listServiceReviewsSchema = z.object({
  serviceId: z.coerce.number().int().positive().optional(),
  authorId: z.coerce.number().int().positive().optional(),
  status: z.enum(['PUBLISHED', 'HIDDEN', 'FLAGGED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(['recent', 'oldest', 'highest', 'lowest']).default('recent'),
})

export const moderateServiceReviewSchema = z.object({
  status: z.enum(['PUBLISHED', 'HIDDEN', 'FLAGGED']),
  reason: z.string().trim().max(500).optional(),
})

export const flagServiceReviewSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Por favor descreva o motivo (mínimo 10 caracteres)')
    .max(500, 'Motivo demasiado longo (máximo 500 caracteres)'),
})

export type CreateServiceReviewInput = z.infer<typeof createServiceReviewSchema>
export type UpdateServiceReviewInput = z.infer<typeof updateServiceReviewSchema>
export type ReplyToServiceReviewInput = z.infer<typeof replyToServiceReviewSchema>
export type ListServiceReviewsInput = z.infer<typeof listServiceReviewsSchema>
export type ModerateServiceReviewInput = z.infer<typeof moderateServiceReviewSchema>
export type FlagServiceReviewInput = z.infer<typeof flagServiceReviewSchema>
