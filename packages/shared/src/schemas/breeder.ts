// ============================================
// PataCerta — Zod Schemas (Breeder)
// ============================================

import { z } from 'zod'
import { DocType } from '../enums.js'
import { optionalUrlSchema, portuguesePhoneSchema } from './common.js'

/** Portuguese NIF validation (9 digits, check digit algorithm) */
export function isValidNif(nif: string): boolean {
  if (!/^\d{9}$/.test(nif)) return false

  const digits = nif.split('').map(Number)
  const checkDigit = digits[8]

  let sum = 0
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * (9 - i)
  }

  const remainder = sum % 11
  const expected = remainder < 2 ? 0 : 11 - remainder

  return checkDigit === expected
}

export const nifSchema = z
  .string()
  .length(9, 'NIF deve ter 9 dígitos')
  .regex(/^\d{9}$/, 'NIF deve conter apenas dígitos')
  .refine(isValidNif, 'NIF inválido')

/**
 * DGAV number validation.
 * DGAV doesn't publish a formal public format, but issued numbers are
 * alphanumeric identifiers typically 6-20 chars. We accept:
 *   - Optional "PT" or "DGAV-" prefix
 *   - Digits, letters, hyphens, slashes
 *   - 6-20 chars after normalization
 */
export const dgavNumberSchema = z
  .string()
  .trim()
  .min(6, 'Número DGAV deve ter pelo menos 6 caracteres')
  .max(50, 'Número DGAV demasiado longo')
  .regex(/^[A-Za-z0-9\-\/]+$/, 'Número DGAV só pode conter letras, dígitos, hífens e barras')

/**
 * Aceita youtubeVideoId em diversas formas:
 *  - id puro (11 chars):  "dQw4w9WgXcQ"
 *  - youtu.be/...        => extrai
 *  - youtube.com/watch?v=... => extrai
 *
 * Devolve apenas o id (11 chars) ou string vazia (limpar).
 */
export const youtubeVideoIdSchema = z
  .string()
  .trim()
  .max(200)
  .transform((raw) => {
    if (!raw) return ''
    // ja e' um id puro
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw
    try {
      const url = new URL(raw)
      const host = url.hostname.replace(/^www\./, '')
      if (host === 'youtu.be') {
        const id = url.pathname.replace(/^\//, '')
        if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id
      }
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const v = url.searchParams.get('v')
        if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v
        // /embed/ID, /shorts/ID
        const m = url.pathname.match(/\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})/)
        if (m) return m[1]
      }
    } catch {
      // not a URL — fall through
    }
    return null as unknown as string
  })
  .refine((v) => v === '' || /^[A-Za-z0-9_-]{11}$/.test(v), {
    message: 'URL/ID YouTube invalido',
  })

export const breederProfileSchema = z
  .object({
    businessName: z.string().trim().min(2).max(200),
    nif: nifSchema,
    dgavNumber: dgavNumberSchema,
    description: z.string().trim().max(2000).optional(),
    districtId: z.number().int().positive(),
    municipalityId: z.number().int().positive(),
    // MVP: campo deprecated — backend assume sempre 'cao'.
    // Mantido como opcional no schema para compatibilidade futura multi-espécie.
    speciesIds: z.array(z.number().int().positive()).optional(),
    // Raças que o criador trabalha (ids do catálogo Breed). Pode estar vazio
    // SE otherBreedsNote for preenchido (caso "só raças não listadas"). A
    // regra "pelo menos uma das duas" é validada via .superRefine() abaixo.
    breedIds: z.array(z.number().int().positive()).max(50).optional(),
    // Texto livre para raças que não constam do catálogo. Visível no perfil.
    otherBreedsNote: z.string().trim().max(500).optional(),
    website: optionalUrlSchema.optional(),
    phone: portuguesePhoneSchema.optional(),

    // Apresentacao publica
    youtubeVideoId: youtubeVideoIdSchema.optional(),

    // Reconhecimentos oficiais
    cpcMember: z.boolean().optional(),
    fciAffiliated: z.boolean().optional(),

    // Sao incluidos com cada cachorro
    vetCheckup: z.boolean().optional(),
    microchip: z.boolean().optional(),
    vaccinations: z.boolean().optional(),
    lopRegistry: z.boolean().optional(),
    kennelName: z.boolean().optional(),
    salesInvoice: z.boolean().optional(),
    food: z.boolean().optional(),
    initialTraining: z.boolean().optional(),

    // Recolha
    pickupInPerson: z.boolean().optional(),
    deliveryByCar: z.boolean().optional(),
    deliveryByPlane: z.boolean().optional(),
    pickupNotes: z.string().trim().max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    const hasBreed = (val.breedIds?.length ?? 0) > 0
    const hasOther = !!val.otherBreedsNote && val.otherBreedsNote.trim().length > 0
    if (!hasBreed && !hasOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['breedIds'],
        message: 'Indique pelo menos uma raça do catálogo ou descreva em "Outras raças".',
      })
    }
  })

// O update aceita PATCH parcial — não obriga sempre a ter raças (o utilizador
// pode estar a actualizar só, p.ex., o telefone). A validação "pelo menos uma"
// já foi feita na criação do perfil.
export const updateBreederProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(200).optional(),
  nif: nifSchema.optional(),
  dgavNumber: dgavNumberSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  districtId: z.number().int().positive().optional(),
  municipalityId: z.number().int().positive().optional(),
  speciesIds: z.array(z.number().int().positive()).optional(),
  breedIds: z.array(z.number().int().positive()).max(50).optional(),
  otherBreedsNote: z.string().trim().max(500).optional(),
  website: optionalUrlSchema.optional(),
  phone: portuguesePhoneSchema.optional(),
  youtubeVideoId: youtubeVideoIdSchema.optional(),
  cpcMember: z.boolean().optional(),
  fciAffiliated: z.boolean().optional(),
  vetCheckup: z.boolean().optional(),
  microchip: z.boolean().optional(),
  vaccinations: z.boolean().optional(),
  lopRegistry: z.boolean().optional(),
  kennelName: z.boolean().optional(),
  salesInvoice: z.boolean().optional(),
  food: z.boolean().optional(),
  initialTraining: z.boolean().optional(),
  pickupInPerson: z.boolean().optional(),
  deliveryByCar: z.boolean().optional(),
  deliveryByPlane: z.boolean().optional(),
  pickupNotes: z.string().trim().max(1000).optional(),
})

export const reorderBreederPhotosSchema = z.object({
  photoIds: z
    .array(z.number().int().positive())
    .min(1, 'Indique pelo menos uma foto')
    .max(10, 'Maximo 10 fotos'),
})

export const verificationDocUploadSchema = z.object({
  docType: z.nativeEnum(DocType),
})

export const verificationReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().max(500).optional(),
})

export type BreederProfileInput = z.infer<typeof breederProfileSchema>
export type UpdateBreederProfileInput = z.infer<typeof updateBreederProfileSchema>
export type ReorderBreederPhotosInput = z.infer<typeof reorderBreederPhotosSchema>
export type VerificationDocUploadInput = z.infer<typeof verificationDocUploadSchema>
export type VerificationReviewInput = z.infer<typeof verificationReviewSchema>
