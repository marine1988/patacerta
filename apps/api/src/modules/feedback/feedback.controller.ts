import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, paginatedResponse } from '../../lib/helpers.js'
import { logAudit } from '../../lib/audit.js'
import { logger } from '../../lib/logger.js'
import type { CreateFeedbackInput, ListFeedbackInput } from '@patacerta/shared'
import { Prisma } from '@prisma/client'
import { buildFeedbackMarkdown } from './feedback.markdown.js'
import type { FeedbackMarkdownItem } from './feedback.markdown.js'

/** Limite de negócio: 5 feedbacks por utilizador (decisão de produto). */
export const FEEDBACK_LIMIT = 5

const FEEDBACK_LIMIT_MESSAGE = 'Atingiu o limite de 5 feedbacks. Obrigado!'
const FEEDBACK_CONFLICT_MESSAGE =
  'Não foi possível registar o feedback devido a pedidos simultâneos. Tente novamente.'
const MAX_TRANSACTION_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 10

const FEEDBACK_SELECT = {
  id: true,
  userId: true,
  category: true,
  title: true,
  body: true,
  votes: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
} satisfies Prisma.FeedbackSelect

type FeedbackRow = Prisma.FeedbackGetPayload<{ select: typeof FEEDBACK_SELECT }>

type CreateFeedbackTxResult = { limitReached: true } | { limitReached: false; created: FeedbackRow }

/**
 * Detecta conflitos que valem retry: Prisma P2034 ("write conflict or
 * deadlock"), SQLSTATE 40001 (serialization_failure) e 40P01
 * (deadlock_detected) — os dois últimos podem chegar crus do driver.
 */
function isSerializationConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  if (code === 'P2034' || code === '40001' || code === '40P01') return true
  return (
    typeof message === 'string' &&
    /could not serialize|serialization failure|deadlock detected/i.test(message)
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Cria o feedback respeitando atómicamente o limite por utilizador.
 *
 * `count` + `create` correm na MESMA transacção Serializable: sem isto, N
 * pedidos simultâneos liam todos o mesmo `count` antes de qualquer insert e
 * gravavam N linhas acima do limite (SEC-03 — sonda do auditor: 6 pedidos
 * concorrentes com 4 linhas → 10 linhas em BD).
 *
 * Serializable faz o Postgres abortar uma das transacções concorrentes com
 * um conflito de serialização; a tentativa seguinte vê o `count` já
 * actualizado. Esses conflitos são esperados e resolvem-se por retry com
 * backoff exponencial (máx. 3 tentativas).
 *
 * Esgotadas as tentativas sem sucesso, devolve-se 409 `FEEDBACK_WRITE_CONFLICT`
 * — nunca a mensagem do limite, que seria mentira se o utilizador ainda
 * tiver vagas. O 409 `FEEDBACK_LIMIT_REACHED` continua a ser a defesa em
 * profundidade e a mensagem que o utilizador já conhece.
 *
 * Exportado para os testes de concorrência (a rota usa-o via `createFeedback`).
 */
export async function createFeedbackWithinLimit(
  userId: number,
  data: Pick<CreateFeedbackInput, 'category' | 'title' | 'body'>,
): Promise<FeedbackRow> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
    let result: CreateFeedbackTxResult
    try {
      result = await prisma.$transaction(
        async (tx): Promise<CreateFeedbackTxResult> => {
          const count = await tx.feedback.count({ where: { userId } })
          if (count >= FEEDBACK_LIMIT) return { limitReached: true }
          const created = await tx.feedback.create({
            data: {
              userId,
              category: data.category,
              title: data.title,
              body: data.body,
            },
            select: FEEDBACK_SELECT,
          })
          return { limitReached: false, created }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (err) {
      if (!isSerializationConflict(err)) throw err
      if (attempt === MAX_TRANSACTION_ATTEMPTS) {
        logger.warn(
          { err, userId, attempts: attempt },
          '[feedback] conflito de escrita persistente',
        )
        throw new AppError(409, FEEDBACK_CONFLICT_MESSAGE, 'FEEDBACK_WRITE_CONFLICT')
      }
      // Backoff exponencial: 10ms, 20ms — suficiente para a transacção
      // vencedora commitar antes da próxima leitura do `count`.
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
      continue
    }

    if (result.limitReached) {
      throw new AppError(409, FEEDBACK_LIMIT_MESSAGE, 'FEEDBACK_LIMIT_REACHED')
    }
    return result.created
  }

  // Inalcançável (o loop ou devolve ou lança), mas mantém o tipo honesto.
  throw new AppError(409, FEEDBACK_CONFLICT_MESSAGE, 'FEEDBACK_WRITE_CONFLICT')
}

export const listFeedback = asyncHandler(async (req, res) => {
  const { category, page, limit } = req.query as unknown as ListFeedbackInput

  const where: Prisma.FeedbackWhereInput = {}
  if (category) where.category = category

  const [feedback, total] = await Promise.all([
    prisma.feedback.findMany({
      where,
      select: FEEDBACK_SELECT,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.feedback.count({ where }),
  ])

  res.json(paginatedResponse(feedback, total, page, limit))
})

export const getMyFeedback = asyncHandler(async (req, res) => {
  const userId = req.user!.userId
  const limit = FEEDBACK_LIMIT
  const items = await prisma.feedback.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: FEEDBACK_SELECT,
  })
  res.json({ data: items, limit, remaining: Math.max(0, limit - items.length) })
})

export const createFeedback = asyncHandler(async (req, res) => {
  const data = req.body as CreateFeedbackInput
  const userId = req.user!.userId

  const created = await createFeedbackWithinLimit(userId, data)

  await logAudit({
    userId,
    action: 'FEEDBACK_CREATED',
    entity: 'feedback',
    entityId: created.id,
    details: `Categoria: ${data.category} | Título: ${data.title}`,
    ipAddress: req.ip,
  })

  res.status(201).json({ ...created, hasVoted: false })
})

export const exportFeedback = asyncHandler(async (_req, res) => {
  const feedback = await prisma.feedback.findMany({
    select: {
      id: true,
      userId: true,
      category: true,
      title: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
  })

  const items: FeedbackMarkdownItem[] = feedback.map((f) => ({
    id: f.id,
    userId: f.userId,
    category: f.category,
    title: f.title,
    body: f.body,
    createdAt: f.createdAt,
    user: f.user,
  }))

  const md = buildFeedbackMarkdown(items, new Date())

  const dateStr = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="patacerta-feedback-${dateStr}.md"`)
  res.send(md)
})
