import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import type { PaginatedMeta } from '../../lib/pagination'
import { useAuth } from '../../hooks/useAuth'
import { formatDateTime, formatSmart } from '../../lib/dates'
import { Card, Avatar, Badge, Button, EmptyState, Spinner } from '../../components/ui'
import { NewThreadModal } from '../../components/messages/NewThreadModal'
import { LinkifiedText } from '../../components/messages/LinkifiedText'
import { MessageActionsMenu } from '../../components/messages/MessageActionsMenu'
import { ReportMessageModal } from '../../components/messages/ReportMessageModal'
import { MESSAGE_EDIT_WINDOW_MINUTES } from '@patacerta/shared'
interface ThreadUser {
  id: number
  firstName: string
  lastName: string
  avatarUrl: string | null
}

interface ThreadSummary {
  id: number
  subject: string
  unreadCount: number
  updatedAt: string
  archivedByOwnerAt: string | null
  archivedByBreederAt: string | null
  owner: ThreadUser
  breeder: {
    id: number
    businessName: string
    user: ThreadUser
  } | null
  service: {
    id: number
    title: string
    provider: ThreadUser
  } | null
  messages: Array<{
    id: number
    body: string
    senderId: number
    readAt: string | null
    createdAt: string
    deletedAt: string | null
  }>
}

interface ThreadMessage {
  id: number
  senderId: number
  body: string
  readAt: string | null
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  sender: ThreadUser
}

interface ThreadDetail {
  id: number
  subject: string
  owner: ThreadUser
  breeder: {
    id: number
    businessName: string
    status: string
    user: ThreadUser
  } | null
  service: {
    id: number
    title: string
    status: string
    provider: ThreadUser
  } | null
  messages: ThreadMessage[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export function MessagesTab() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(() => {
    const t = searchParams.get('threadId')
    return t ? Number(t) : null
  })
  const [replyText, setReplyText] = useState('')
  const [newThreadOpen, setNewThreadOpen] = useState(false)
  const [newThreadError, setNewThreadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Archive filter (active vs archived threads)
  const [showArchived, setShowArchived] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState('')

  // Edit / delete / report UI state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [reportTargetId, setReportTargetId] = useState<number | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  const breederIdParam = searchParams.get('breederId')
  const pendingBreederId = breederIdParam ? Number(breederIdParam) : null

  const { data: targetBreeder } = useQuery<{ id: number; businessName: string; userId: number }>({
    queryKey: ['breeder', pendingBreederId],
    queryFn: () => api.get(`/breeders/${pendingBreederId}`).then((r) => r.data),
    enabled: !!pendingBreederId,
  })

  // When ?breederId is present and valid, open the new-thread modal.
  useEffect(() => {
    if (!pendingBreederId || !targetBreeder) return
    if (user && targetBreeder.userId === user.id) {
      // self, clear silently
      searchParams.delete('breederId')
      setSearchParams(searchParams, { replace: true })
      return
    }
    setNewThreadOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBreederId, targetBreeder?.id])

  const { data: threadsData, isLoading: threadsLoading } = useQuery<{
    data: ThreadSummary[]
    meta: PaginatedMeta
  }>({
    queryKey: ['threads', showArchived ? 'archived' : 'active'],
    queryFn: () =>
      api
        .get(`/messages/threads?page=1&limit=50&archived=${showArchived ? 'true' : 'false'}`)
        .then((r) => r.data),
    refetchInterval: 30_000,
  })

  const threads = threadsData?.data ?? []

  const {
    data: threadPages,
    isLoading: threadLoading,
    isError: threadError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery<ThreadDetail, Error>({
    queryKey: ['thread', selectedThreadId],
    queryFn: ({ pageParam = 1 }) =>
      api
        .get(`/messages/threads/${selectedThreadId}?page=${pageParam}&limit=50`)
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      // Next page = older messages. Server page 1 = newest; page 2 = older; etc.
      const p = lastPage.pagination
      return p.page < p.totalPages ? p.page + 1 : undefined
    },
    enabled: !!selectedThreadId,
    refetchInterval: selectedThreadId ? 15_000 : false,
    refetchOnWindowFocus: true,
  })

  // Head page (newest messages) is always pages[0]; older pages append.
  // Concatenate in ascending chronological order: oldest page first.
  const threadDetail: ThreadDetail | undefined = threadPages?.pages[0]
  const allMessages: ThreadMessage[] = threadPages
    ? threadPages.pages
        .slice()
        .reverse()
        .flatMap((p) => p.messages)
    : []

  // Sync selectedThreadId to URL
  useEffect(() => {
    if (selectedThreadId) {
      searchParams.set('threadId', String(selectedThreadId))
    } else {
      searchParams.delete('threadId')
    }
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId])

  // Auto-scroll to bottom:
  //  - when the thread changes (initial open)
  //  - when a new message is appended at the tail (newest id changed)
  // NOT when older pages are loaded via fetchNextPage.
  const lastMessageIdRef = useRef<number | null>(null)
  const lastThreadIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (!threadDetail) return
    const newestId = allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null
    const threadChanged = lastThreadIdRef.current !== threadDetail.id
    const tailChanged = lastMessageIdRef.current !== newestId
    if (threadChanged || tailChanged) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({
          behavior: threadChanged ? 'auto' : 'smooth',
          block: 'end',
        })
      })
    }
    lastThreadIdRef.current = threadDetail.id
    lastMessageIdRef.current = newestId

    // If a new incoming (not our own) message arrived while the thread is open,
    // auto-mark it as read to clear the unread badge without requiring a click.
    const newestMessage = allMessages[allMessages.length - 1]
    if (
      tailChanged &&
      !threadChanged &&
      newestMessage &&
      newestMessage.senderId !== user?.id &&
      newestMessage.id > 0 &&
      !newestMessage.readAt
    ) {
      markReadMutation.mutate(threadDetail.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadDetail?.id, allMessages.length, allMessages[allMessages.length - 1]?.id])

  const markReadMutation = useMutation({
    mutationFn: (threadId: number) => api.patch(`/messages/threads/${threadId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
  })

  const replyMutation = useMutation({
    mutationFn: (data: { threadId: number; body: string }) =>
      api.post(`/messages/threads/${data.threadId}/messages`, { body: data.body }),
    // Optimistic insert: append a temporary message with a negative id to the newest page
    onMutate: async (data) => {
      if (!user) return
      const queryKey = ['thread', data.threadId]
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<{
        pages: ThreadDetail[]
        pageParams: number[]
      }>(queryKey)
      if (!previous) return { previous }

      const tempId = -Date.now()
      const optimisticMessage: ThreadMessage = {
        id: tempId,
        senderId: user.id,
        body: data.body,
        readAt: null,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deletedAt: null,
        sender: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          avatarUrl: null,
        },
      }

      queryClient.setQueryData(queryKey, {
        ...previous,
        pages: previous.pages.map((p, idx) =>
          idx === 0 ? { ...p, messages: [...p.messages, optimisticMessage] } : p,
        ),
      })
      return { previous, tempId }
    },
    onSuccess: (res, _variables, _context) => {
      setReplyText('')
      setSendError(null)
      // Replace optimistic entry (or just refetch) by invalidating
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      void res
    },
    onError: (err, _variables, context) => {
      if (context?.previous && selectedThreadId) {
        queryClient.setQueryData(['thread', selectedThreadId], context.previous)
      }
      setSendError(extractApiError(err, 'Erro ao enviar mensagem.'))
    },
  })

  const createThreadMutation = useMutation({
    mutationFn: (values: { subject: string; body: string }) =>
      api
        .post('/messages/threads', { breederId: pendingBreederId!, ...values })
        .then((r) => r.data),
    onSuccess: (res) => {
      setNewThreadOpen(false)
      setNewThreadError(null)
      searchParams.delete('breederId')
      searchParams.set('threadId', String(res.threadId))
      setSearchParams(searchParams, { replace: true })
      setSelectedThreadId(res.threadId)
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
    onError: (err) => {
      setNewThreadError(extractApiError(err, 'Erro ao criar conversa.'))
    },
  })

  const archiveMutation = useMutation({
    mutationFn: ({ threadId, archive }: { threadId: number; archive: boolean }) =>
      api.patch(`/messages/threads/${threadId}/${archive ? 'archive' : 'unarchive'}`),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
      // If the archived thread was open, close its detail view
      if (variables.archive && selectedThreadId === variables.threadId) {
        setSelectedThreadId(null)
      }
    },
  })

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: number; body: string }) =>
      api.patch(`/messages/messages/${messageId}`, { body }).then((r) => r.data),
    onSuccess: () => {
      setEditingMessageId(null)
      setEditText('')
      setEditError(null)
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
    },
    onError: (err) => {
      setEditError(extractApiError(err, 'Erro ao editar mensagem.'))
    },
  })

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) => api.delete(`/messages/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['thread', selectedThreadId] })
      queryClient.invalidateQueries({ queryKey: ['threads'] })
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
    },
  })

  const reportMessageMutation = useMutation({
    mutationFn: ({ messageId, reason }: { messageId: number; reason: string }) =>
      api.post(`/messages/messages/${messageId}/report`, { reason }).then((r) => r.data),
    onSuccess: () => {
      setReportTargetId(null)
      setReportError(null)
    },
    onError: (err) => {
      setReportError(extractApiError(err, 'Erro ao denunciar mensagem.'))
    },
  })

  // Search
  interface SearchHit {
    id: number
    body: string
    createdAt: string
    senderId: number
    threadId: number
    sender: ThreadUser
    thread: {
      id: number
      subject: string
      owner: { id: number; firstName: string; lastName: string }
      breeder: { id: number; businessName: string } | null
      service: { id: number; title: string } | null
    }
  }
  const { data: searchResults, isFetching: searchLoading } = useQuery<{
    data: SearchHit[]
    meta: PaginatedMeta
  }>({
    queryKey: ['messages', 'search', searchSubmitted],
    queryFn: () =>
      api
        .get(`/messages/search?q=${encodeURIComponent(searchSubmitted)}&page=1&limit=20`)
        .then((r) => r.data),
    enabled: searchSubmitted.length >= 2,
    staleTime: 10_000,
  })

  function openThread(threadId: number) {
    setSelectedThreadId(threadId)
    markReadMutation.mutate(threadId)
  }

  function handleReply(e: FormEvent) {
    e.preventDefault()
    setSendError(null)
    if (!replyText.trim() || !selectedThreadId) return
    replyMutation.mutate({ threadId: selectedThreadId, body: replyText.trim() })
  }

  if (threadsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  // Thread detail view
  if (selectedThreadId) {
    if (threadLoading) {
      return (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )
    }

    if (threadError || !threadDetail) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setSelectedThreadId(null)}>
            &larr; Voltar
          </Button>
          <EmptyState title="Conversa nÃ£o encontrada" />
        </div>
      )
    }

    const counterpartyName = threadDetail.breeder
      ? threadDetail.breeder.businessName
      : threadDetail.service
        ? threadDetail.service.title
        : 'Conversa'
    const otherParty =
      user && threadDetail.owner.id === user.id
        ? {
            name: counterpartyName,
            avatarName: counterpartyName,
          }
        : {
            name: `${threadDetail.owner.firstName} ${threadDetail.owner.lastName}`,
            avatarName: `${threadDetail.owner.firstName} ${threadDetail.owner.lastName}`,
          }

    const canLoadOlder = !!hasNextPage

    // Thread archive state from the current user's perspective
    const currentThreadSummary = threads.find((t) => t.id === threadDetail.id)
    const isArchivedForMe = currentThreadSummary
      ? user && threadDetail.owner.id === user.id
        ? !!currentThreadSummary.archivedByOwnerAt
        : !!currentThreadSummary.archivedByBreederAt
      : false

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedThreadId(null)}>
            &larr; Voltar Ã s conversas
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={archiveMutation.isPending}
            onClick={() =>
              archiveMutation.mutate({
                threadId: threadDetail.id,
                archive: !isArchivedForMe,
              })
            }
          >
            {isArchivedForMe ? 'Desarquivar' : 'Arquivar'}
          </Button>
        </div>

        <Card hover={false}>
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
            <Avatar name={otherParty.avatarName} size="md" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-lg font-semibold text-gray-900">
                {threadDetail.subject}
              </h3>
              <p className="text-sm text-gray-500">Com: {otherParty.name}</p>
            </div>
          </div>

          <div className="mt-4 max-h-[500px] space-y-3 overflow-y-auto">
            {canLoadOlder && (
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fetchNextPage()}
                  loading={isFetchingNextPage}
                >
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}

            {allMessages.map((msg) => {
              const isOwn = msg.senderId === user?.id
              const senderName = `${msg.sender.firstName} ${msg.sender.lastName}`
              const isPending = msg.id < 0
              const isDeleted = !!msg.deletedAt
              const isEdited = !!msg.editedAt && !isDeleted
              const ageMs = Date.now() - new Date(msg.createdAt).getTime()
              const withinEditWindow = ageMs < MESSAGE_EDIT_WINDOW_MINUTES * 60_000
              const canEdit = isOwn && !isDeleted && !isPending && withinEditWindow
              const canDelete = canEdit
              const canReport = !isOwn && !isDeleted && !isPending

              if (isDeleted) {
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[75%] rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 italic text-gray-400">
                      <p className="text-sm">(mensagem eliminada pelo autor)</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDateTime(msg.createdAt)}</p>
                    </div>
                  </div>
                )
              }

              const isEditing = editingMessageId === msg.id

              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`group relative max-w-[75%] rounded-lg px-4 py-2 ${
                      isOwn ? 'bg-caramel-600 text-white' : 'bg-gray-100 text-gray-900'
                    } ${isPending ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`mb-1 text-xs font-medium ${
                          isOwn ? 'text-caramel-100' : 'text-gray-500'
                        }`}
                      >
                        {senderName}
                      </p>
                      {!isEditing && (
                        <MessageActionsMenu
                          variant={isOwn ? 'own' : 'other'}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          canReport={canReport}
                          onEdit={() => {
                            setEditingMessageId(msg.id)
                            setEditText(msg.body)
                            setEditError(null)
                          }}
                          onDelete={() => {
                            if (
                              window.confirm(
                                'Eliminar esta mensagem? Esta aÃ§Ã£o nÃ£o pode ser desfeita.',
                              )
                            ) {
                              deleteMessageMutation.mutate(msg.id)
                            }
                          }}
                          onReport={() => {
                            setReportTargetId(msg.id)
                            setReportError(null)
                          }}
                        />
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          className="input min-h-[60px] text-gray-900"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          maxLength={5000}
                          autoFocus
                        />
                        {editError && <p className="text-xs text-red-200">{editError}</p>}
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            onClick={() => {
                              setEditingMessageId(null)
                              setEditText('')
                              setEditError(null)
                            }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            loading={editMessageMutation.isPending}
                            onClick={() => {
                              const trimmed = editText.trim()
                              if (!trimmed) {
                                setEditError('Mensagem nÃ£o pode estar vazia.')
                                return
                              }
                              editMessageMutation.mutate({
                                messageId: msg.id,
                                body: trimmed,
                              })
                            }}
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <LinkifiedText
                        text={msg.body}
                        className="block whitespace-pre-wrap text-sm"
                        linkClassName={
                          isOwn
                            ? 'underline decoration-caramel-200 underline-offset-2 hover:text-white'
                            : 'text-caramel-700 underline decoration-dotted underline-offset-2 hover:decoration-solid'
                        }
                      />
                    )}

                    <p
                      className={`mt-1 text-xs ${isOwn ? 'text-caramel-200' : 'text-gray-400'}`}
                      title={formatDateTime(msg.createdAt)}
                    >
                      {formatDateTime(msg.createdAt)}
                      {isEdited && ' Â· editada'}
                      {isOwn && msg.readAt && ' Â· lida'}
                    </p>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleReply} className="mt-6 space-y-2">
            <div className="flex gap-3">
              <textarea
                className="input min-h-[60px] flex-1"
                placeholder="Escrever resposta..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                maxLength={5000}
                required
              />
              <Button type="submit" loading={replyMutation.isPending}>
                Enviar
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{replyText.length}/5000</p>
              {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            </div>
          </form>
        </Card>

        <ReportMessageModal
          isOpen={reportTargetId !== null}
          onClose={() => setReportTargetId(null)}
          onSubmit={(reason) =>
            reportTargetId !== null &&
            reportMessageMutation.mutate({ messageId: reportTargetId, reason })
          }
          isSubmitting={reportMessageMutation.isPending}
          errorMessage={reportError}
        />
      </div>
    )
  }

  // Thread list
  const hasSearch = searchSubmitted.length >= 2
  return (
    <>
      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearchSubmitted(searchQuery.trim())
        }}
        className="mb-4 flex gap-2"
      >
        <input
          type="search"
          className="input flex-1"
          placeholder="Pesquisar nas suas conversas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          minLength={2}
        />
        <Button type="submit" variant="secondary" disabled={searchQuery.trim().length < 2}>
          Pesquisar
        </Button>
        {hasSearch && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearchQuery('')
              setSearchSubmitted('')
            }}
          >
            Limpar
          </Button>
        )}
      </form>

      {/* Active/Archived tabs */}
      {!hasSearch && (
        <div className="mb-4 flex gap-1 border-b border-gray-200">
          <button
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              !showArchived
                ? 'border-caramel-600 text-caramel-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setShowArchived(false)}
          >
            Activas
          </button>
          <button
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              showArchived
                ? 'border-caramel-600 text-caramel-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setShowArchived(true)}
          >
            Arquivadas
          </button>
        </div>
      )}

      {hasSearch ? (
        searchLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : !searchResults || searchResults.data.length === 0 ? (
          <EmptyState
            title="Sem resultados"
            description={`Nenhuma mensagem corresponde a "${searchSubmitted}".`}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {searchResults.meta.total} resultado(s) para{' '}
              <strong>&ldquo;{searchSubmitted}&rdquo;</strong>
            </p>
            {searchResults.data.map((hit) => {
              const isOwner = user?.id === hit.thread.owner.id
              const otherName = isOwner
                ? hit.thread.breeder
                  ? hit.thread.breeder.businessName
                  : (hit.thread.service?.title ?? 'Conversa')
                : `${hit.thread.owner.firstName} ${hit.thread.owner.lastName}`
              return (
                <Card
                  key={hit.id}
                  hover
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedThreadId(hit.threadId)
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={otherName} size="md" />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold text-gray-900">
                        {hit.thread.subject}
                      </h4>
                      <p className="text-xs text-gray-500">{otherName}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{hit.body}</p>
                      <p className="mt-1 text-xs text-gray-400">{formatDateTime(hit.createdAt)}</p>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : threads.length === 0 ? (
        <EmptyState
          title={showArchived ? 'Sem conversas arquivadas' : 'Sem mensagens'}
          description={
            showArchived
              ? 'As conversas que arquivar aparecerÃ£o aqui.'
              : 'Quando contactar ou for contactado por criadores, as mensagens aparecerÃ£o aqui.'
          }
        />
      ) : (
        <div className="space-y-3">
          {threads.map((thread) => {
            const isOwner = user?.id === thread.owner.id
            const otherName = isOwner
              ? thread.breeder
                ? thread.breeder.businessName
                : (thread.service?.title ?? 'Conversa')
              : `${thread.owner.firstName} ${thread.owner.lastName}`
            const lastMessage = thread.messages[0]
            const lastBody = lastMessage?.deletedAt ? '(mensagem eliminada)' : lastMessage?.body
            return (
              <Card
                key={thread.id}
                hover
                className="cursor-pointer"
                onClick={() => openThread(thread.id)}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={otherName} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-gray-900">
                        {thread.subject}
                      </h4>
                      {thread.unreadCount > 0 && <Badge variant="blue">{thread.unreadCount}</Badge>}
                    </div>
                    <p className="text-sm text-gray-500">{otherName}</p>
                    {lastBody && (
                      <p
                        className={`truncate text-sm ${
                          lastMessage?.deletedAt ? 'italic text-gray-400' : 'text-gray-400'
                        }`}
                      >
                        {lastBody}
                      </p>
                    )}
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-gray-400">
                    {formatSmart(thread.updatedAt)}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <NewThreadModal
        isOpen={newThreadOpen}
        onClose={() => {
          setNewThreadOpen(false)
          searchParams.delete('breederId')
          setSearchParams(searchParams, { replace: true })
        }}
        onSubmit={(values) => createThreadMutation.mutate(values)}
        breederName={targetBreeder?.businessName}
        defaultSubject={targetBreeder ? `Contacto sobre ${targetBreeder.businessName}` : undefined}
        isSubmitting={createThreadMutation.isPending}
        errorMessage={newThreadError}
      />
    </>
  )
}
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SettingsTab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
