import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { useAuth } from '../../hooks/useAuth'
import { usePageMeta } from '../../hooks/usePageMeta'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { EmptyState } from '../../components/ui/EmptyState'

type FeedbackCategory = 'BUG' | 'SUGESTAO' | 'MELHORIA' | 'OUTRO'

interface FeedbackItem {
  id: number
  userId: number
  category: FeedbackCategory
  title: string
  body: string
  votes: number
  createdAt: string
  updatedAt: string
  hasVoted: boolean
  user: {
    id: number
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
}

interface FeedbackListResponse {
  data: FeedbackItem[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  BUG: 'Bug',
  SUGESTAO: 'Sugestão',
  MELHORIA: 'Melhoria',
  OUTRO: 'Outro',
}

const CATEGORY_VARIANTS: Record<FeedbackCategory, 'red' | 'blue' | 'green' | 'gray'> = {
  BUG: 'red',
  SUGESTAO: 'blue',
  MELHORIA: 'green',
  OUTRO: 'gray',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function FeedbackPage() {
  usePageMeta({
    title: 'Feedback & Sugestões',
    description: 'Dá feedback e vota nas sugestões da comunidade PataCerta.',
    canonicalPath: '/feedback',
  })

  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<FeedbackCategory | ''>('')
  const [sortBy, setSortBy] = useState<'votes' | 'recent'>('votes')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [formCategory, setFormCategory] = useState<FeedbackCategory>('SUGESTAO')
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formError, setFormError] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.feedback.list(page, sortBy, category || null),
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '20')
      params.set('sort', sortBy)
      if (category) params.set('category', category)
      const res = await api.get<FeedbackListResponse>(`/feedback?${params}`)
      return res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<FeedbackItem>('/feedback', {
        category: formCategory,
        title: formTitle,
        body: formBody,
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() })
      setShowForm(false)
      setFormTitle('')
      setFormBody('')
      setFormError('')
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ??
            'Erro ao submeter feedback')
          : 'Erro ao submeter feedback'
      setFormError(message)
    },
  })

  const voteMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'vote' | 'unvote' }) => {
      if (action === 'vote') {
        const res = await api.post<FeedbackItem>(`/feedback/${id}/vote`)
        return res.data
      } else {
        const res = await api.delete<FeedbackItem>(`/feedback/${id}/vote`)
        return res.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (formTitle.trim().length < 5) {
      setFormError('Título deve ter pelo menos 5 caracteres')
      return
    }
    if (formBody.trim().length < 20) {
      setFormError('Feedback deve ter pelo menos 20 caracteres')
      return
    }
    createMutation.mutate()
  }

  const handleVote = (id: number, hasVoted: boolean) => {
    if (!isAuthenticated) return
    voteMutation.mutate({ id, action: hasVoted ? 'unvote' : 'vote' })
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">Feedback & Sugestões</h1>
        <p className="mt-2 text-muted">
          Dá a tua opinião e vota nas sugestões da comunidade. O teu feedback ajuda-nos a melhorar o
          PataCerta.
        </p>
      </div>

      {/* Form toggle */}
      {isAuthenticated && !showForm && (
        <div className="mb-6 text-center">
          <Button onClick={() => setShowForm(true)}>Dar feedback</Button>
        </div>
      )}

      {/* Form */}
      {isAuthenticated && showForm && (
        <Card className="mb-8">
          <form onSubmit={handleSubmit} className="space-y-4 p-4 md:p-6">
            <h2 className="text-lg font-semibold text-ink">Novo feedback</h2>

            {formError && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div>
              <label
                htmlFor="feedback-category"
                className="mb-1 block text-sm font-medium text-ink"
              >
                Categoria
              </label>
              <select
                id="feedback-category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as FeedbackCategory)}
                className="w-full rounded border border-line bg-bg px-3 py-2 text-ink"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="feedback-title" className="mb-1 block text-sm font-medium text-ink">
                Título
              </label>
              <input
                id="feedback-title"
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                maxLength={200}
                placeholder="Resumo do teu feedback"
                className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted"
              />
            </div>

            <div>
              <label htmlFor="feedback-body" className="mb-1 block text-sm font-medium text-ink">
                Descrição
              </label>
              <textarea
                id="feedback-body"
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="Explica o que gostavas de ver melhorado, corrigido ou adicionado..."
                className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted"
              />
              <p className="mt-1 text-xs text-muted">{formBody.length}/5000</p>
            </div>

            <div className="flex gap-3">
              <Button type="submit" loading={createMutation.isPending}>
                Submeter
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Not authenticated notice */}
      {!isAuthenticated && (
        <div className="mb-6 rounded border border-line bg-cream-50 px-4 py-3 text-center text-sm text-muted">
          <a href="/entrar" className="text-caramel-500 hover:underline">
            Inicia sessão
          </a>{' '}
          para dar feedback e votar nas sugestões.
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="filter-category" className="text-sm text-muted">
            Categoria:
          </label>
          <select
            id="filter-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as FeedbackCategory | '')
              setPage(1)
            }}
            className="rounded border border-line bg-bg px-2 py-1 text-sm text-ink"
          >
            <option value="">Todas</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sort-by" className="text-sm text-muted">
            Ordenar:
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as 'votes' | 'recent')
              setPage(1)
            }}
            className="rounded border border-line bg-bg px-2 py-1 text-sm text-ink"
          >
            <option value="votes">Mais votados</option>
            <option value="recent">Mais recentes</option>
          </select>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <EmptyState title="Erro ao carregar feedback" description="Tente novamente mais tarde." />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="Ainda não há feedback"
          description="Seja o primeiro a dar feedback e ajudar a melhorar o PataCerta."
        />
      ) : (
        <>
          <div className="space-y-4">
            {data.data.map((item) => (
              <Card key={item.id} className="transition-shadow">
                <div className="p-4 md:p-5">
                  <div className="flex items-start gap-4">
                    {/* Vote button */}
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleVote(item.id, item.hasVoted)}
                        disabled={!isAuthenticated || voteMutation.isPending}
                        className={`flex h-10 w-10 items-center justify-center rounded border transition-colors ${
                          item.hasVoted
                            ? 'border-caramel-500 bg-caramel-500 text-white'
                            : 'border-line bg-bg text-muted hover:border-caramel-500 hover:text-caramel-500'
                        } ${!isAuthenticated ? 'cursor-not-allowed opacity-50' : ''}`}
                        aria-label={item.hasVoted ? 'Remover voto' : 'Votar'}
                        title={!isAuthenticated ? 'Inicia sessão para votar' : undefined}
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <span className="text-sm font-semibold text-ink">{item.votes}</span>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={CATEGORY_VARIANTS[item.category]}>
                          {CATEGORY_LABELS[item.category]}
                        </Badge>
                        <span className="text-xs text-muted">{formatDate(item.createdAt)}</span>
                      </div>
                      <h3 className="mb-1 font-semibold text-ink">{item.title}</h3>
                      <p className="whitespace-pre-wrap text-sm text-muted">{item.body}</p>
                      <p className="mt-2 text-xs text-muted">
                        por {item.user.firstName} {item.user.lastName}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {data.meta.totalPages > 1 && (
            <div className="mt-6 flex justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span className="flex items-center px-3 text-sm text-muted">
                {page} / {data.meta.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
