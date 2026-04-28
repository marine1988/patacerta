import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { extractApiError } from '../../lib/errors'
import { breederProfileSchema } from '@patacerta/shared'
import { Button, Card, Input, Select, Spinner } from '../../components/ui'

interface District {
  id: number
  namePt: string
}
interface Municipality {
  id: number
  namePt: string
}
interface Breed {
  id: number
  nameSlug: string
  namePt: string
  fciGroup: string | null
}

/**
 * Breeder onboarding — collects the minimum data needed to create the
 * Breeder profile. Triggered after register+login when role===BREEDER and
 * there's no Breeder row yet (hard guard in App.tsx).
 *
 * Detalhes opcionais (vídeo, galeria, condições, recolha) são preenchidos
 * mais tarde no painel.
 */
export function BreederOnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const { data: existing, isLoading: checking } = useQuery<{ id: number } | null>({
    queryKey: ['breeder-profile-onboarding-check'],
    // 404 is expected when no profile yet — swallow it.
    queryFn: () =>
      api
        .get('/breeders/me/profile')
        .then((r) => r.data)
        .catch(() => null),
    retry: false,
  })

  // If user already has a breeder profile, skip onboarding.
  useEffect(() => {
    if (existing && (existing as { id?: number }).id) {
      navigate('/painel', { replace: true })
    }
  }, [existing, navigate])

  const [form, setForm] = useState({
    businessName: '',
    nif: '',
    dgavNumber: '',
    description: '',
    phone: '',
    website: '',
    districtId: '',
    municipalityId: '',
    breedIds: [] as number[],
    hasOtherBreeds: false,
    otherBreedsNote: '',
  })

  const { data: breeds } = useQuery<Breed[]>({
    queryKey: ['breeds'],
    queryFn: () => api.get('/breeds').then((r) => r.data),
    staleTime: 60 * 60 * 1000,
  })

  const { data: districts } = useQuery<District[]>({
    queryKey: ['districts'],
    queryFn: () => api.get('/search/districts').then((r) => r.data),
  })

  const { data: municipalities } = useQuery<Municipality[]>({
    queryKey: ['municipalities', form.districtId],
    queryFn: () =>
      api.get(`/search/districts/${form.districtId}/municipalities`).then((r) => r.data),
    enabled: !!form.districtId,
  })

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/breeders', payload),
    onSuccess: () => {
      // Bust the guard's cache so next render sees the new profile.
      queryClient.invalidateQueries({ queryKey: ['breeder-profile-guard'] })
      queryClient.invalidateQueries({ queryKey: ['breeder-profile'] })
      navigate('/painel?tab=criador', { replace: true })
    },
    onError: (err) => {
      setError(extractApiError(err, 'Erro ao criar perfil de criador.'))
    },
  })

  function update<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const input = {
      businessName: form.businessName.trim(),
      nif: form.nif.trim(),
      dgavNumber: form.dgavNumber.trim(),
      description: form.description.trim() || undefined,
      phone: form.phone.trim() || undefined,
      website: form.website.trim() || undefined,
      districtId: Number(form.districtId),
      municipalityId: Number(form.municipalityId),
      breedIds: form.breedIds,
      otherBreedsNote: form.hasOtherBreeds ? form.otherBreedsNote.trim() || undefined : undefined,
    }

    if (form.breedIds.length === 0 && !input.otherBreedsNote) {
      setError(
        'Indique pelo menos uma raça do catálogo ou descreva as raças que tem em "Outras raças".',
      )
      return
    }

    const parsed = breederProfileSchema.safeParse(input)
    if (!parsed.success) {
      setError(parsed.error.errors[0].message)
      return
    }

    createMutation.mutate(parsed.data)
  }

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Bem-vindo à Patacerta</h1>
        <p className="mt-2 text-sm text-gray-600">
          Para começar, complete o seu perfil de criador. Pode adicionar fotos, vídeo de
          apresentação e mais detalhes mais tarde no painel.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <Input
            label="Nome da actividade / canil"
            value={form.businessName}
            onChange={(e) => update('businessName', e.target.value)}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="NIF"
              value={form.nif}
              onChange={(e) => update('nif', e.target.value)}
              placeholder="9 dígitos"
              required
            />
            <Input
              label="Número DGAV"
              value={form.dgavNumber}
              onChange={(e) => update('dgavNumber', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Distrito"
              value={form.districtId}
              onChange={(e) => {
                update('districtId', e.target.value)
                update('municipalityId', '')
              }}
              options={[
                { value: '', label: 'Selecione…' },
                ...(districts ?? []).map((d) => ({ value: String(d.id), label: d.namePt })),
              ]}
              required
            />
            <Select
              label="Concelho"
              value={form.municipalityId}
              onChange={(e) => update('municipalityId', e.target.value)}
              options={[
                { value: '', label: 'Selecione…' },
                ...(municipalities ?? []).map((m) => ({ value: String(m.id), label: m.namePt })),
              ]}
              disabled={!form.districtId}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Raças que cria <span className="text-red-600">*</span>
            </label>
            <p className="mb-3 text-xs text-gray-600">
              Seleccione as raças do catálogo (LOP/CPC). Se trabalha com raças não listadas, pode
              descrevê-las em "Outras raças".
            </p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-300 p-3">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {(breeds ?? []).map((b) => {
                  const checked = form.breedIds.includes(b.id)
                  return (
                    <label
                      key={b.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-cream-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            breedIds: e.target.checked
                              ? [...prev.breedIds, b.id]
                              : prev.breedIds.filter((id) => id !== b.id),
                          }))
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-caramel-500 focus:ring-caramel-500"
                      />
                      <span className="text-gray-800">{b.namePt}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            {form.breedIds.length > 0 && (
              <p className="mt-2 text-xs text-gray-600">
                {form.breedIds.length} {form.breedIds.length === 1 ? 'raça' : 'raças'} seleccionada
                {form.breedIds.length === 1 ? '' : 's'}.
              </p>
            )}
          </div>

          <div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={form.hasOtherBreeds}
                onChange={(e) => update('hasOtherBreeds', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-caramel-500 focus:ring-caramel-500"
              />
              Tenho outras raças não listadas
            </label>
            {form.hasOtherBreeds && (
              <textarea
                value={form.otherBreedsNote}
                onChange={(e) => update('otherBreedsNote', e.target.value)}
                rows={3}
                maxLength={500}
                className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-caramel-500 focus:ring-1 focus:ring-caramel-500"
                placeholder="Indique as raças que cria (máx. 500 caracteres)…"
              />
            )}
          </div>

          <Input
            label="Telemóvel (opcional)"
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            placeholder="+351 912 345 678"
          />

          <Input
            label="Website (opcional)"
            type="url"
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
            placeholder="https://"
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Apresentação (opcional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={4}
              maxLength={2000}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-caramel-500 focus:ring-1 focus:ring-caramel-500"
              placeholder="Conte-nos brevemente sobre o seu canil…"
            />
          </div>

          <Button type="submit" loading={createMutation.isPending} className="w-full">
            Criar perfil e continuar
          </Button>
        </form>
      </Card>
    </div>
  )
}
