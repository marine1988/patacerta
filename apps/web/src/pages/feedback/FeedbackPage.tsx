import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { queryKeys } from '../../lib/queryKeys'
import { useAuth } from '../../hooks/useAuth'
import { usePageMeta } from '../../hooks/usePageMeta'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Spinner'
import { extractApiError } from '../../lib/errors'
import { formatDateShort } from '../../lib/dates'

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
  user: {
    id: number
    firstName: string
    lastName: string
    avatarUrl: string | null
  }
}

interface FeedbackMineResponse {
  data: FeedbackItem[]
  limit: number
  remaining: number
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

const FEEDBACK_LIMIT = 5

export function FeedbackPage() {
  usePageMeta({
    title: 'Feedback & Sugestões',
    description: 'Dê feedback e vote nas sugestões da comunidade PataCerta.',
    canonicalPath: '/feedback',
  })

  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [formCategory, setFormCategory] = useState<FeedbackCategory>('SUGESTAO')
  const [formTitle, setFormTitle] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formError, setFormError] = useState('')

  const {
    data: mineData,
    isLoading: mineLoading,
    isError: mineError,
    refetch: refetchMine,
  } = useQuery<FeedbackMineResponse>({
    queryKey: queryKeys.feedback.mine(),
    queryFn: async () => {
      const res = await api.get<FeedbackMineResponse>('/feedback/mine')
      return res.data
    },
    enabled: isAuthenticated,
  })

  const items = mineData?.data ?? []
  const limit = mineData?.limit ?? FEEDBACK_LIMIT
  const remaining = mineData?.remaining ?? FEEDBACK_LIMIT
  const canSubmit = remaining > 0

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<FeedbackItem>('/feedback', {
        category: formCategory,
        title: formTitle.trim(),
        body: formBody.trim(),
      })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.mine() })
      queryClient.invalidateQueries({ queryKey: queryKeys.feedback.all() })
      setFormTitle('')
      setFormBody('')
      setFormError('')
    },
    onError: (err: unknown) => {
      setFormError(extractApiError(err, 'Erro ao submeter o feedback.'))
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    if (formTitle.trim().length < 5) {
      setFormError('O título deve ter pelo menos 5 caracteres.')
      return
    }
    if (formBody.trim().length < 20) {
      setFormError('O feedback deve ter pelo menos 20 caracteres.')
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-bold text-ink sm:text-4xl">Feedback & Sugestões</h1>
        <p className="mt-2 text-muted">
          Dê a sua opinião e vote nas sugestões da comunidade. O seu feedback ajuda-nos a melhorar o
          PataCerta.
        </p>
      </div>

      {/* Not authenticated */}
      {!isAuthenticated && (
        <Card className="mx-auto max-w-md">
          <div className="p-6 text-center">
            <p className="mb-4 text-muted">Inicie sessão para enviar o seu feedback.</p>
            <Button onClick={() => navigate('/entrar')}>Iniciar sessão</Button>
          </div>
        </Card>
      )}

      {/* Authenticated, loading */}
      {isAuthenticated && mineLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {/* Authenticated, error */}
      {isAuthenticated && !mineLoading && mineError && (
        <Card>
          <div className="p-6 text-center">
            <p className="mb-4 text-sm text-red-700">Não foi possível carregar o seu feedback.</p>
            <Button onClick={() => refetchMine()}>Tentar novamente</Button>
          </div>
        </Card>
      )}

      {/* Authenticated, loaded */}
      {isAuthenticated && !mineLoading && !mineError && (
        <>
          {/* Form or limit reached */}
          {canSubmit ? (
            <Card className="mb-6">
              <form onSubmit={handleSubmit} className="space-y-4 p-4 md:p-6">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-ink">Enviar feedback</h2>
                  <span className="text-xs text-muted">
                    {items.length} de {limit}
                  </span>
                </div>

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
                  <label
                    htmlFor="feedback-title"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    Título
                  </label>
                  <input
                    id="feedback-title"
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    maxLength={200}
                    placeholder="Resumo do seu feedback"
                    className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted"
                  />
                  <p className="mt-1 text-xs text-muted">{formTitle.length}/200</p>
                </div>

                <div>
                  <label
                    htmlFor="feedback-body"
                    className="mb-1 block text-sm font-medium text-ink"
                  >
                    Descrição
                  </label>
                  <textarea
                    id="feedback-body"
                    value={formBody}
                    onChange={(e) => setFormBody(e.target.value)}
                    rows={5}
                    maxLength={5000}
                    placeholder="Explique o que gostaria de ver melhorado, corrigido ou adicionado..."
                    className="w-full rounded border border-line bg-bg px-3 py-2 text-ink placeholder:text-muted"
                  />
                  <p className="mt-1 text-xs text-muted">{formBody.length}/5000</p>
                </div>

                <div className="flex gap-3">
                  <Button type="submit" loading={createMutation.isPending}>
                    Enviar feedback
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card className="mb-6">
              <div className="p-4 text-sm text-muted">
                Atingiu o limite de 5 feedbacks. Obrigado!
              </div>
            </Card>
          )}

          {/* List of my feedbacks */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-ink">Os seus feedbacks</h2>
            {items.length === 0 ? (
              <Card>
                <div className="p-6 text-center text-sm text-muted">Ainda não enviou feedback.</div>
              </Card>
            ) : (
              items.map((item) => (
                <Card key={item.id}>
                  <div className="p-4 md:p-6">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Badge variant={CATEGORY_VARIANTS[item.category]}>
                        {CATEGORY_LABELS[item.category]}
                      </Badge>
                      <span className="text-xs text-muted">{formatDateShort(item.createdAt)}</span>
                    </div>
                    <h3 className="mb-2 font-semibold text-ink">{item.title}</h3>
                    <p className="whitespace-pre-wrap text-sm text-muted">{item.body}</p>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
