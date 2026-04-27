import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, Avatar, Badge } from '../ui'
import { StarRating } from '../shared/StarRating'
import { formatDate } from '../../lib/dates'

/**
 * Modelo unificado de review para o ReviewCard.
 *
 * Todos os campos sao os comuns entre `Review` e `ServiceReview`. O autor e
 * opcional para suportar contextos onde nao queremos mostra-lo (ex: tab
 * "Minhas avaliacoes" — o autor sou eu).
 */
export interface ReviewCardData {
  id: number
  rating: number
  title: string
  body: string | null
  status: string
  moderationReason?: string | null
  reply: string | null
  repliedAt: string | null
  createdAt: string
  author?: {
    id: number
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
}

export type ReviewCardVariant = 'card' | 'list-item'

interface ReviewCardProps {
  review: ReviewCardData
  /** Linha "Sobre: ..." abaixo do header. Se houver `to`, e link. */
  context?: { label: string; to?: string }
  /** Mostrar avatar+nome do autor (default true se review.author existir). */
  showAuthor?: boolean
  /** Badge a destacar (ex.: "A sua avaliacao"). */
  ownLabel?: string
  /** Mostrar badge de estado (PUBLISHED/FLAGGED/HIDDEN). Default false. */
  showStatusBadge?: boolean
  /** Mostrar motivo da moderacao quando status === HIDDEN. Default false. */
  showModerationReason?: boolean
  /** Etiqueta da seccao da resposta (ex.: "Resposta do criador"). Default "Resposta". */
  replyLabel?: string
  /** Se definido, renderiza botao "Editar" no header da resposta. */
  onReplyEdit?: () => void
  /** Conteudo extra (botoes de accao) abaixo da review. */
  actions?: ReactNode
  /** Wrapper externo: Card (default) ou item de lista para usar dentro de divide-y. */
  variant?: ReviewCardVariant
}

const STATUS_VARIANT: Record<string, 'green' | 'yellow' | 'red' | 'gray'> = {
  PUBLISHED: 'green',
  FLAGGED: 'yellow',
  HIDDEN: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Publicada',
  FLAGGED: 'Em revisão',
  HIDDEN: 'Oculta',
}

/**
 * Componente partilhado para mostrar uma avaliacao (criador ou servico).
 *
 * Markup unificado para painel (cards), perfis publicos (list-item dentro de
 * divide-y) e a propria avaliacao do utilizador. As accoes sao injectadas pelo
 * caller via `actions` para suportar combinacoes diferentes (Eliminar,
 * Responder, Denunciar).
 */
export function ReviewCard({
  review,
  context,
  showAuthor,
  ownLabel,
  showStatusBadge = false,
  showModerationReason = false,
  replyLabel = 'Resposta',
  onReplyEdit,
  actions,
  variant = 'card',
}: ReviewCardProps) {
  const renderAuthor = showAuthor ?? !!review.author
  const author = review.author

  const inner = (
    <div className="flex items-start gap-3">
      {renderAuthor && author && (
        <Avatar
          name={`${author.firstName} ${author.lastName}`}
          imageUrl={author.avatarUrl ?? undefined}
          size="sm"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {renderAuthor && author && (
            <span className="text-sm font-medium text-gray-900">
              {author.firstName} {author.lastName}
            </span>
          )}
          <StarRating rating={review.rating} />
          {ownLabel && <Badge variant="blue">{ownLabel}</Badge>}
          {showStatusBadge && (
            <Badge variant={STATUS_VARIANT[review.status] ?? 'gray'}>
              {STATUS_LABEL[review.status] ?? review.status}
            </Badge>
          )}
        </div>

        <h4 className="mt-1 text-sm font-semibold text-gray-900">{review.title}</h4>

        {context && (
          <p className="mt-0.5 text-xs text-gray-500">
            Sobre:{' '}
            {context.to ? (
              <Link to={context.to} className="text-caramel-600 hover:underline">
                {context.label}
              </Link>
            ) : (
              <span>{context.label}</span>
            )}
          </p>
        )}

        {review.body && (
          <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{review.body}</p>
        )}

        {showModerationReason && review.status === 'HIDDEN' && review.moderationReason && (
          <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
            <strong>Motivo da moderação:</strong> {review.moderationReason}
          </p>
        )}

        <p className="mt-1 text-xs text-gray-400">{formatDate(review.createdAt)}</p>

        {review.reply && (
          <div className="mt-3 rounded-lg bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-500">
                {replyLabel}
                {review.repliedAt && ` · ${formatDate(review.repliedAt)}`}
              </p>
              {onReplyEdit && review.status === 'PUBLISHED' && (
                <button
                  type="button"
                  className="text-xs text-caramel-600 hover:underline"
                  onClick={onReplyEdit}
                >
                  Editar
                </button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-600">{review.reply}</p>
          </div>
        )}

        {actions && <div className="mt-2 flex flex-wrap gap-3 text-xs">{actions}</div>}
      </div>
    </div>
  )

  if (variant === 'list-item') {
    return <div className="py-4 first:pt-0 last:pb-0">{inner}</div>
  }

  return <Card hover={false}>{inner}</Card>
}
