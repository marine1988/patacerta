import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api'
import { queryKeys } from '../../../lib/queryKeys'
import { formatDateShort } from '../../../lib/dates'
import { extractApiError } from '../../../lib/errors'
import { Pagination } from '../../../components/ui/Pagination'
import type { Paginated } from '../../../lib/pagination'
import { Badge, Button, Select, Spinner, EmptyState } from '../../../components/ui'

type FeedbackCategory = 'BUG' | 'SUGESTAO' | 'MELHORIA' | 'OUTRO'

interface AdminFeedbackItem {
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

function authorName(item: AdminFeedbackItem): string {
  return `${item.user.firstName} ${item.user.lastName}`
}

export function FeedbackTab() {
  const [page, setPage] = useState(1)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<Paginated<AdminFeedbackItem>>({
    queryKey: queryKeys.admin.feedback(page, categoryFilter || null),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (categoryFilter) params.set('category', categoryFilter)
      return api.get(`/admin/feedback?${params}`).then((r) => r.data)
    },
  })

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      const res = await api.get('/admin/feedback/export.md', { responseType: 'blob' })
      const blob = res.data as Blob
      const cd = (res.headers?.['content-disposition'] as string | undefined) ?? ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename =
        match?.[1] ?? `patacerta-feedback-${new Date().toISOString().slice(0, 10)}.md`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(extractApiError(err, 'Erro ao exportar o feedback.'))
    } finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <EmptyState title="Erro ao carregar feedback" description="Tente novamente mais tarde." />
    )
  }

  const items = data?.data ?? []

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:max-w-xs">
          <Select
            label="Filtrar por categoria"
            name="feedback-category-filter"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value)
              setPage(1)
            }}
            options={[
              { value: '', label: 'Todas' },
              { value: 'BUG', label: 'Bug' },
              { value: 'SUGESTAO', label: 'Sugestão' },
              { value: 'MELHORIA', label: 'Melhoria' },
              { value: 'OUTRO', label: 'Outro' },
            ]}
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button onClick={handleExport} loading={exporting} variant="secondary">
            Exportar .md
          </Button>
          {exportError && <p className="text-sm text-red-600">{exportError}</p>}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Ainda não há feedback."
          description="Aparece aqui quando os utilizadores enviarem o seu feedback."
        />
      ) : (
        <>
          <div className="hidden md:block md:overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Autor</th>
                  <th className="px-3 py-2">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const isExpanded = expanded.has(item.id)
                  const long = item.body.length > 120
                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-line/60 align-top ${i % 2 === 1 ? 'bg-surface-alt/40' : ''}`}
                    >
                      <td className="px-3 py-2 text-ink whitespace-nowrap">
                        {formatDateShort(item.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={CATEGORY_VARIANTS[item.category]}>
                          {CATEGORY_LABELS[item.category]}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium text-ink">{item.title}</td>
                      <td className="px-3 py-2 text-ink">{authorName(item)}</td>
                      <td className="px-3 py-2 text-muted">
                        <p className={isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
                          {item.body}
                        </p>
                        {long && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            className="mt-1 text-xs text-caramel-600 hover:underline"
                          >
                            {isExpanded ? 'ver menos' : 'ver mais'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {items.map((item) => {
              const isExpanded = expanded.has(item.id)
              const long = item.body.length > 120
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-line bg-surface p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{item.title}</p>
                      <p className="text-xs text-muted">{authorName(item)}</p>
                    </div>
                    <Badge variant={CATEGORY_VARIANTS[item.category]}>
                      {CATEGORY_LABELS[item.category]}
                    </Badge>
                  </div>
                  <p className="mb-1 text-xs text-muted">{formatDateShort(item.createdAt)}</p>
                  <p
                    className={
                      isExpanded
                        ? 'whitespace-pre-wrap text-sm text-muted'
                        : 'line-clamp-3 text-sm text-muted'
                    }
                  >
                    {item.body}
                  </p>
                  {long && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="mt-1 text-xs text-caramel-600 hover:underline"
                    >
                      {isExpanded ? 'ver menos' : 'ver mais'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          <Pagination variant="summary" meta={data!.meta} page={page} onChange={setPage} />
        </>
      )}
    </div>
  )
}
