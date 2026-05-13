// ============================================
// PataCerta — Tab "Destaque" (Sponsored Slots) na área pessoal
// ============================================
//
// Permite ao criador VERIFIED:
//   1. Ver os destaques actuais (PAID/PENDING/EXPIRED) com métricas
//      básicas (impressões, cliques, prazo).
//   2. Comprar um novo destaque para uma raça à sua escolha — seleciona
//      raça, vê preço fixo (10€/30 dias), redirecciona para Stripe
//      Checkout (cartão / Multibanco / MB Way / Google/Apple Pay).
//   3. Ver banner de sucesso/cancelamento na volta do Stripe via
//      query params `?checkout=success` ou `?checkout=cancelled`.
//
// O backend impõe um máximo de 3 slots ocupados (PAID+PENDING) por raça
// — verificamos availability antes de mostrar o botão.

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { queryKeys } from '../../lib/queryKeys'
import { useBreeds, type BreedOption } from '../../lib/useLookups'
import type {
  MySponsoredSlot,
  SponsoredSlotAvailability,
  SponsoredSlotPaymentStatus,
  CreateCheckoutResponse,
} from '../../lib/payments'
import { Card, Badge, Button, Modal, Select, Spinner } from '../../components/ui'

interface BreederProfileProbe {
  id: number
  status: string
}

const PAYMENT_STATUS_LABEL: Record<SponsoredSlotPaymentStatus, string> = {
  LEGACY: 'Cortesia',
  PENDING: 'Pagamento pendente',
  PAID: 'Activo',
  FAILED: 'Pagamento falhou',
  REFUNDED: 'Reembolsado',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return '—'
  return `${(cents / 100).toFixed(2)} ${(currency ?? 'EUR').toUpperCase()}`
}

function getStatusVariant(slot: MySponsoredSlot): 'green' | 'yellow' | 'red' | 'gray' {
  if (slot.paymentStatus === 'PAID' && slot.status === 'ACTIVE') return 'green'
  if (slot.paymentStatus === 'PENDING') return 'yellow'
  if (slot.paymentStatus === 'FAILED' || slot.paymentStatus === 'REFUNDED') return 'red'
  if (slot.paymentStatus === 'LEGACY' && slot.status === 'ACTIVE') return 'green'
  return 'gray'
}

export function DestaqueTab() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [prefillBreedId, setPrefillBreedId] = useState<number | null>(null)

  // ── Confirma estado VERIFIED ────────────────────────────────────
  // Mesmo que a tab só seja exposta a criadores verificados, fazemos
  // a verificação localmente para evitar render do botão se algo
  // mudar entretanto.
  const {
    data: breeder,
    isLoading: breederLoading,
    isError: breederError,
  } = useQuery<BreederProfileProbe>({
    queryKey: queryKeys.breeder.profile(),
    queryFn: () => api.get('/breeders/me/profile').then((r) => r.data),
  })
  const isVerified = breeder?.status === 'VERIFIED'

  // ── Histórico/estado actual dos slots do criador ─────────────────
  const {
    data: slotsResp,
    isLoading: slotsLoading,
    isError: slotsError,
  } = useQuery<{ data: MySponsoredSlot[] }>({
    queryKey: queryKeys.payments.mySlots(),
    queryFn: () => api.get('/payments/sponsored-slot/mine').then((r) => r.data),
  })
  const slots = slotsResp?.data ?? []
  const activeSlots = slots.filter(
    (s) =>
      s.paymentStatus === 'PAID' ||
      s.paymentStatus === 'PENDING' ||
      (s.paymentStatus === 'LEGACY' && s.status === 'ACTIVE'),
  )
  const pastSlots = slots.filter((s) => !activeSlots.includes(s))

  // ── Reagir aos query params de retorno do Stripe ─────────────────
  useEffect(() => {
    const checkout = searchParams.get('checkout')
    const prefill = searchParams.get('prefillBreedId')
    let dirty = false
    const next = new URLSearchParams(searchParams)

    if (checkout === 'success') {
      setMsg({
        type: 'success',
        text: 'Pagamento recebido. Se pagou com cartão o destaque já está activo. Para Multibanco, ficará activo assim que pagarmos a referência (pode demorar alguns minutos a horas).',
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.all() })
      next.delete('checkout')
      next.delete('session_id')
      dirty = true
    } else if (checkout === 'cancelled') {
      setMsg({
        type: 'info',
        text: 'Compra cancelada. Nenhum valor foi cobrado.',
      })
      next.delete('checkout')
      dirty = true
    }

    if (prefill) {
      const id = Number(prefill)
      if (Number.isFinite(id) && id > 0) {
        setPrefillBreedId(id)
        setPurchaseOpen(true)
      }
      next.delete('prefillBreedId')
      dirty = true
    }

    if (dirty) setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, queryClient])

  if (breederLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (breederError) {
    return (
      <Card>
        <div className="text-center">
          <p className="eyebrow-muted mb-2">— Erro</p>
          <h3 className="font-serif text-xl text-ink">Não foi possível carregar o seu perfil</h3>
          <p className="mt-2 text-sm text-muted">
            Tente recarregar a página daqui a alguns instantes.
          </p>
        </div>
      </Card>
    )
  }

  if (!isVerified) {
    return (
      <Card>
        <div className="text-center">
          <p className="eyebrow-muted mb-2">— Destaque indisponível</p>
          <h3 className="font-serif text-xl text-ink">Apenas criadores verificados</h3>
          <p className="mt-2 text-sm text-muted">
            Conclua a verificação do seu perfil de criador para poder destacar a sua ficha no
            simulador de raça.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {msg && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            msg.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-900'
              : msg.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-caramel-200 bg-caramel-50 text-caramel-900'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Apresentação + CTA */}
      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="eyebrow-muted">— Destaque no simulador</p>
            <h2 className="font-serif text-xl text-ink">
              Apareça como criador recomendado para uma raça
            </h2>
            <p className="mt-2 text-sm text-muted">
              A sua ficha é mostrada aos utilizadores que terminam o simulador e recebem essa raça
              como recomendação. Preço fixo:{' '}
              <strong className="text-ink">10,00 € por 30 dias</strong> por raça. Máximo 3 criadores
              destacados em simultâneo na mesma raça.
            </p>
          </div>
          <div>
            <Button onClick={() => setPurchaseOpen(true)}>Comprar destaque</Button>
          </div>
        </div>
      </Card>

      {/* Slots activos / pendentes */}
      <section>
        <h3 className="mb-3 font-serif text-lg text-ink">Destaques actuais</h3>
        {slotsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : slotsError ? (
          <Card>
            <p className="text-sm text-red-700">
              Erro ao carregar destaques. Tente recarregar a página.
            </p>
          </Card>
        ) : activeSlots.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Ainda não tem destaques activos. Use o botão acima para comprar o primeiro.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {activeSlots.map((s) => (
              <SlotRow key={s.id} slot={s} />
            ))}
          </div>
        )}
      </section>

      {/* Histórico */}
      {pastSlots.length > 0 && (
        <section>
          <h3 className="mb-3 font-serif text-lg text-ink">Histórico</h3>
          <div className="flex flex-col gap-3">
            {pastSlots.map((s) => (
              <SlotRow key={s.id} slot={s} muted />
            ))}
          </div>
        </section>
      )}

      <PurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        existingBreedIds={activeSlots.map((s) => s.breedId)}
        prefillBreedId={prefillBreedId}
        onError={(text) => setMsg({ type: 'error', text })}
      />
    </div>
  )
}

// ── Linha de slot ──────────────────────────────────────────────────

interface SlotRowProps {
  slot: MySponsoredSlot
  muted?: boolean
}

function SlotRow({ slot, muted }: SlotRowProps) {
  const variant = getStatusVariant(slot)
  return (
    <Card className={muted ? 'opacity-70' : undefined}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-serif text-lg text-ink">{slot.breed.namePt}</h4>
            <Badge variant={variant}>{PAYMENT_STATUS_LABEL[slot.paymentStatus]}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {slot.paymentStatus === 'PAID' || slot.paymentStatus === 'LEGACY' ? (
              <>
                Activo de {formatDate(slot.startsAt)} a {formatDate(slot.endsAt)}
              </>
            ) : slot.paymentStatus === 'PENDING' ? (
              <>Aguarda confirmação do pagamento (válido até {formatDate(slot.endsAt)})</>
            ) : (
              <>Iniciado em {formatDate(slot.createdAt)}</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          <span>
            <strong className="text-ink">{slot.impressionCount}</strong> impressões
          </span>
          <span>
            <strong className="text-ink">{slot.clickCount}</strong> cliques
          </span>
          <span>{formatPrice(slot.priceCents, slot.currency)}</span>
          {slot.stripeReceiptUrl && (
            <a
              href={slot.stripeReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caramel-600 underline-offset-2 hover:underline"
            >
              Recibo
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── Modal de compra ────────────────────────────────────────────────
//
// Pede ao utilizador qual raça destacar, mostra availability em
// tempo real (chama /availability quando muda a raça seleccionada) e
// inicia a Checkout Session redireccionando para o Stripe.

interface PurchaseModalProps {
  open: boolean
  onClose: () => void
  existingBreedIds: number[]
  prefillBreedId: number | null
  onError: (text: string) => void
}

function PurchaseModal({
  open,
  onClose,
  existingBreedIds,
  prefillBreedId,
  onError,
}: PurchaseModalProps) {
  const queryClient = useQueryClient()
  const { data: breeds } = useBreeds()
  const [breedId, setBreedId] = useState<number | null>(null)

  // Reset selecção sempre que reabrir; aplica prefill se existir.
  useEffect(() => {
    if (open) setBreedId(prefillBreedId)
  }, [open, prefillBreedId])

  const sortedBreeds = useMemo<BreedOption[]>(() => {
    if (!breeds) return []
    return [...breeds].sort((a, b) => a.namePt.localeCompare(b.namePt, 'pt'))
  }, [breeds])

  const { data: availability, isFetching: availFetching } = useQuery<SponsoredSlotAvailability>({
    queryKey: queryKeys.payments.availability(breedId),
    queryFn: () =>
      api.get('/payments/sponsored-slot/availability', { params: { breedId } }).then((r) => r.data),
    enabled: !!breedId,
  })

  const checkoutMutation = useMutation<CreateCheckoutResponse, unknown, { breedId: number }>({
    mutationFn: (vars) => api.post('/payments/sponsored-slot/checkout', vars).then((r) => r.data),
    onSuccess: (data) => {
      // Stripe Checkout é hosted — redirect full-page. Não usamos
      // loadStripe() / redirectToCheckout porque a API já devolve a
      // URL canónica da sessão (mais simples e reduz JS no FE).
      window.location.href = data.url
    },
    onError: (err) => {
      onError(extractApiError(err, 'Não foi possível iniciar o pagamento.'))
    },
  })

  function handleSubmit() {
    if (!breedId) return
    checkoutMutation.mutate({ breedId })
    // Invalidate-on-return: caso o utilizador volte com sucesso, a
    // lista de slots é re-fetched no useEffect do tab.
    queryClient.invalidateQueries({ queryKey: queryKeys.payments.all() })
  }

  const alreadyOwned = breedId != null && existingBreedIds.includes(breedId)
  const noVacancy = availability != null && availability.available <= 0 && !alreadyOwned
  const canBuy = !!breedId && !alreadyOwned && !noVacancy && !availFetching

  return (
    <Modal isOpen={open} onClose={onClose} title="Comprar destaque" size="md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Escolha a raça onde quer ser destacado. Será cobrado{' '}
          <strong className="text-ink">10,00 € por 30 dias</strong>. O pagamento é processado pela
          Stripe (cartão, Multibanco, MB Way, Google Pay).
        </p>

        <Select
          label="Raça"
          value={breedId == null ? '' : String(breedId)}
          onChange={(e) => {
            const v = e.target.value
            setBreedId(v ? Number(v) : null)
          }}
          placeholder="— Seleccione uma raça —"
          options={sortedBreeds.map((b) => ({ value: String(b.id), label: b.namePt }))}
        />

        {breedId && (
          <div className="rounded-lg border border-line bg-cream-50 px-4 py-3 text-sm">
            {availFetching ? (
              <p className="text-muted">A verificar disponibilidade…</p>
            ) : alreadyOwned ? (
              <p className="text-amber-800">
                Já tem um destaque activo ou pendente nesta raça. Aguarde que expire para comprar
                outro.
              </p>
            ) : availability ? (
              availability.available > 0 ? (
                <p className="text-ink">
                  <strong>{availability.available}</strong> de {availability.maxSlots} vagas
                  disponíveis nesta raça.
                </p>
              ) : (
                <p className="text-red-800">
                  Esta raça já tem {availability.maxSlots} criadores destacados. Tente outra raça ou
                  aguarde que um destaque expire.
                </p>
              )
            ) : null}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2">
          <p className="text-xs text-subtle">
            Ao avançar, aceita os{' '}
            <a
              href="/termos-pagamento"
              target="_blank"
              rel="noopener noreferrer"
              className="link-inline"
            >
              Termos de Pagamento
            </a>
            .
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={checkoutMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!canBuy} loading={checkoutMutation.isPending}>
              Avançar para pagamento
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
