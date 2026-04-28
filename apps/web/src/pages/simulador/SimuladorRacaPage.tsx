// ============================================
// PataCerta — Simulador "Encontrar a raça ideal"
// ============================================
//
// Quiz multi-step público. Stateless: as respostas só vivem em
// estado local; quando submetidas chamam POST /api/breed-matcher/match
// e mostram top 5 raças com score e highlights.
//
// Não envolve criadores específicos por raça (modelo BreederBreed
// ainda não existe). Em vez disso, o CTA final aponta para
// /pesquisar?tipo=criadores onde o utilizador pode filtrar por
// distrito/espécie.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import type { BreedMatchInput, BreedMatchResponse } from '@patacerta/shared'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Spinner } from '../../components/ui/Spinner'
import { Badge } from '../../components/ui/Badge'
import { SponsoredBreedersStrip } from '../../components/shared/SponsoredBreedersStrip'

// ─── Definição das perguntas ──────────────────────────────────────
//
// Mantemos isto declarativo para facilitar afinação editorial sem
// tocar na estrutura do componente.

interface QuizOption {
  value: string
  label: string
  hint?: string
}

interface QuizStep {
  field: keyof BreedMatchInput
  title: string
  subtitle?: string
  options: QuizOption[]
}

const STEPS: QuizStep[] = [
  {
    field: 'housing',
    title: 'Onde mora?',
    subtitle: 'O espaço disponível pesa muito na escolha da raça.',
    options: [
      { value: 'apartment_small', label: 'Apartamento pequeno (T0/T1)' },
      { value: 'apartment_large', label: 'Apartamento grande (T2+)' },
      { value: 'house_no_garden', label: 'Casa sem jardim' },
      { value: 'house_garden', label: 'Casa com jardim' },
      { value: 'rural', label: 'Quinta ou zona rural' },
    ],
  },
  {
    field: 'activity',
    title: 'Qual é o seu nível de actividade?',
    subtitle: 'Quanto exercício consegue fazer com o cão por dia?',
    options: [
      { value: 'low', label: 'Baixo', hint: 'Passeios curtos, vida tranquila' },
      { value: 'medium', label: 'Médio', hint: 'Caminhadas diárias de 30–60 min' },
      { value: 'high', label: 'Alto', hint: 'Corro/pedalo várias vezes por semana' },
      { value: 'athlete', label: 'Atleta', hint: 'Treino intenso quase todos os dias' },
    ],
  },
  {
    field: 'timeAlone',
    title: 'Quanto tempo o cão fica sozinho em casa?',
    options: [
      { value: 'rarely', label: 'Quase nunca' },
      { value: 'few_hours', label: 'Algumas horas' },
      { value: 'half_day', label: 'Metade do dia' },
      { value: 'full_day', label: 'O dia inteiro' },
    ],
  },
  {
    field: 'experience',
    title: 'Já teve cão antes?',
    options: [
      { value: 'novice', label: 'É o meu primeiro cão' },
      { value: 'some', label: 'Já tive cão, mas há tempos' },
      { value: 'experienced', label: 'Sim, tenho bastante experiência' },
    ],
  },
  {
    field: 'household',
    title: 'Como é o agregado familiar?',
    options: [
      { value: 'single', label: 'Vivo sozinho/a' },
      { value: 'couple', label: 'Casal sem crianças' },
      { value: 'kids_small', label: 'Crianças pequenas (até 10 anos)' },
      { value: 'kids_teen', label: 'Adolescentes' },
      { value: 'elders', label: 'Pessoas idosas em casa' },
    ],
  },
  {
    field: 'otherDogs',
    title: 'Tem outros cães em casa?',
    options: [
      { value: 'none', label: 'Nenhum' },
      { value: 'one', label: 'Um' },
      { value: 'multiple', label: 'Mais do que um' },
    ],
  },
  {
    field: 'allergies',
    title: 'Há alergias a pêlo de cão na família?',
    options: [
      { value: 'none', label: 'Nenhuma' },
      { value: 'mild', label: 'Ligeiras' },
      { value: 'severe', label: 'Sérias — preciso de raça hipoalergénica' },
    ],
  },
  {
    field: 'grooming',
    title: 'Quanto tempo está disposto a dedicar à pelagem?',
    options: [
      { value: 'minimal', label: 'O mínimo possível' },
      { value: 'moderate', label: 'Escovar 1–2 vezes por semana' },
      { value: 'happy_to_groom', label: 'Adoro tratar do pêlo, sem problema' },
    ],
  },
  {
    field: 'noiseTolerance',
    title: 'Tolerância a latidos?',
    subtitle: 'Vizinhos próximos? Bebés a dormir?',
    options: [
      { value: 'quiet', label: 'Preciso de um cão sossegado' },
      { value: 'medium', label: 'Algum latido tudo bem' },
      { value: 'no_problem', label: 'Não me incomoda' },
    ],
  },
  {
    field: 'climate',
    title: 'Em que clima vive?',
    options: [
      { value: 'hot', label: 'Quente (Algarve, Alentejo interior)' },
      { value: 'mild', label: 'Ameno (litoral, Lisboa, Porto)' },
      { value: 'cold', label: 'Fresco/frio (interior norte, serras)' },
    ],
  },
  {
    field: 'sizePreference',
    title: 'Tem preferência de tamanho?',
    options: [
      { value: 'any', label: 'Sem preferência' },
      { value: 'small', label: 'Pequeno' },
      { value: 'medium', label: 'Médio' },
      { value: 'large', label: 'Grande' },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────

const SIZE_LABEL: Record<string, string> = {
  small: 'Pequeno',
  medium: 'Médio',
  large: 'Grande',
  giant: 'Gigante',
}

function ScoreBadge({ score }: { score: number }) {
  // Cor por faixa — não exageramos, mantemos paleta editorial
  const tone =
    score >= 85
      ? 'bg-caramel-500 text-white'
      : score >= 70
        ? 'bg-caramel-100 text-caramel-700'
        : 'bg-line text-muted'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}
    >
      {score}% match
    </span>
  )
}

// Imagem da raça com fallback gracioso. As raças autóctones portuguesas
// não têm URL no seed (Dog CEO não as cobre) — mostramos uma silhueta
// editorial em vez de uma imagem partida.
function BreedImage({
  src,
  name,
  className = '',
}: {
  src: string | null
  name: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const showPlaceholder = !src || errored

  if (showPlaceholder) {
    return (
      <div
        className={`flex items-center justify-center bg-caramel-100/50 ${className}`}
        aria-label={name}
      >
        {/* Silhueta minimal de cão — mantém o tom editorial */}
        <svg
          className="h-12 w-12 text-caramel-500/50"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.5 9.5c0-1.5 1-3 2.5-3.5l1-2c.2-.4.6-.5 1-.3l1.2.6c.3.2.5.5.5.9v1.4c.6-.2 1.3-.3 2.3-.3s1.7.1 2.3.3V5c0-.4.2-.7.5-.9l1.2-.6c.4-.2.8 0 1 .3l1 2c1.5.5 2.5 2 2.5 3.5v6c0 1.7-.8 3.2-2.1 4.1-.5.4-1.1.6-1.7.7l-.7.1c-.5.1-1 .1-1.5.1H10c-.5 0-1 0-1.5-.1l-.7-.1c-.6-.1-1.2-.3-1.7-.7C4.8 18.7 4 17.2 4 15.5v-6h.5z" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setErrored(true)}
      className={`object-cover ${className}`}
      loading="lazy"
    />
  )
}

// ─── Página ───────────────────────────────────────────────────────

export function SimuladorRacaPage() {
  const [stepIndex, setStepIndex] = useState(0)
  const [answers, setAnswers] = useState<Partial<BreedMatchInput>>({})

  const mutation = useMutation({
    mutationFn: async (input: BreedMatchInput) => {
      const res = await api.post<BreedMatchResponse>('/breed-matcher/match', input)
      return res.data
    },
  })

  const totalSteps = STEPS.length
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100)
  const currentStep = STEPS[stepIndex]
  const isLastStep = stepIndex === totalSteps - 1
  const showResults = mutation.isSuccess

  function handleSelect(value: string) {
    const next = { ...answers, [currentStep.field]: value } as Partial<BreedMatchInput>
    setAnswers(next)

    if (isLastStep) {
      // Submeter — todos os campos devem estar presentes
      mutation.mutate(next as BreedMatchInput)
    } else {
      setStepIndex(stepIndex + 1)
    }
  }

  function handleBack() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
  }

  function handleRestart() {
    setStepIndex(0)
    setAnswers({})
    mutation.reset()
  }

  // ─── Resultados ─────────────────────────────────────────────────
  if (showResults && mutation.data) {
    const { results } = mutation.data
    return (
      <div className="mx-auto max-w-[60rem] px-6 py-12 lg:px-8">
        <header className="mb-10 text-center">
          <p className="text-[11px] font-medium uppercase tracking-caps text-caramel-500">
            Resultado do simulador
          </p>
          <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">
            As raças mais compatíveis consigo
          </h1>
          <p className="mt-3 text-muted">
            Baseado nas suas respostas, estas são as 5 raças que melhor encaixam no seu perfil.
          </p>
        </header>

        {results.length === 0 ? (
          <Card>
            <p className="text-center text-muted">
              Não encontrámos raças compatíveis. Tente ajustar as suas respostas.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {results.map((r, idx) => (
              <Card key={r.breed.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  {/* Imagem da raça (à esquerda em desktop, no topo em mobile) */}
                  <BreedImage
                    src={r.breed.imageUrl}
                    name={r.breed.namePt}
                    className="h-40 w-full shrink-0 md:h-32 md:w-32"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-serif text-2xl text-caramel-500">#{idx + 1}</span>
                      <h2 className="font-serif text-xl text-ink">{r.breed.namePt}</h2>
                    </div>
                    <p className="mt-2 text-sm text-muted">{r.breed.summaryPt}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge>{SIZE_LABEL[r.breed.size] ?? r.breed.size}</Badge>
                      <Badge>
                        {r.breed.weightMinKg}–{r.breed.weightMaxKg} kg
                      </Badge>
                      <Badge>
                        {r.breed.lifespanMinYrs}–{r.breed.lifespanMaxYrs} anos
                      </Badge>
                      <Badge>Energia {r.breed.energyLevel}/5</Badge>
                      {r.breed.hypoallergenic && <Badge>Hipoalergénica</Badge>}
                      {r.breed.apartmentFriendly && <Badge>Boa em apartamento</Badge>}
                      {r.breed.noviceFriendly && <Badge>Boa para iniciantes</Badge>}
                    </div>

                    {r.highlights.length > 0 && (
                      <ul className="mt-4 space-y-1 text-sm text-ink">
                        {r.highlights.map((h, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-caramel-500">•</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <ScoreBadge score={r.score} />
                  </div>
                </div>

                <SponsoredBreedersStrip
                  breeders={r.sponsoredBreeders}
                  breedId={r.breed.id}
                  breedNamePt={r.breed.namePt}
                />
              </Card>
            ))}
          </div>
        )}

        <div className="mt-10 border-t border-line pt-8">
          <p className="eyebrow-muted mb-3">— Aviso importante</p>
          <div className="space-y-3 text-xs leading-relaxed text-muted">
            <p>
              Este simulador é uma{' '}
              <em className="not-italic font-medium text-ink">ferramenta orientativa</em>, baseada
              em características gerais de cada raça. Os resultados representam tendências e não
              garantem comportamento, saúde ou compatibilidade individual de qualquer cão em
              concreto.
            </p>
            <p>
              Cada cão é único — o temperamento depende de genética, socialização, treino e
              ambiente. Antes de adquirir ou adoptar, recomendamos vivamente conhecer o animal
              pessoalmente e consultar criadores responsáveis, associações de adopção, veterinários
              ou treinadores qualificados.
            </p>
            <p>
              A PataCerta <em className="not-italic font-medium text-ink">não se responsabiliza</em>{' '}
              por decisões tomadas com base nos resultados deste simulador, nem por questões
              relacionadas com saúde, comportamento ou adaptação do animal escolhido. A escolha e a
              responsabilidade pelo cuidado do cão são sempre do tutor.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 border-t border-line pt-8">
          <p className="text-center text-muted">
            Já sabe o que procura? Encontre criadores verificados perto de si.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link to="/pesquisar" className="btn-primary">
              Ver criadores na PataCerta
            </Link>
            <button onClick={handleRestart} className="btn-secondary">
              Refazer simulador
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Loading ────────────────────────────────────────────────────
  if (mutation.isPending) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[40rem] flex-col items-center justify-center gap-4 px-6">
        <Spinner size="lg" />
        <p className="text-muted">A calcular as raças mais compatíveis…</p>
      </div>
    )
  }

  // ─── Erro ───────────────────────────────────────────────────────
  if (mutation.isError) {
    return (
      <div className="mx-auto max-w-[40rem] px-6 py-16 text-center">
        <h1 className="font-serif text-2xl text-ink">Algo correu mal</h1>
        <p className="mt-3 text-muted">
          Não foi possível calcular o resultado. Por favor tente novamente.
        </p>
        <div className="mt-6">
          <Button onClick={handleRestart}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  // ─── Quiz ───────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[40rem] px-6 py-12 lg:px-8">
      <header className="mb-8 text-center">
        <p className="text-[11px] font-medium uppercase tracking-caps text-caramel-500">
          Simulador de raça
        </p>
        <h1 className="mt-2 font-serif text-3xl text-ink md:text-4xl">
          Encontre o cão ideal para si
        </h1>
        <p className="mt-3 text-muted">
          Responda a {totalSteps} perguntas curtas. Demora menos de 2 minutos.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Ferramenta orientativa — os resultados são sugestões, não recomendações profissionais.
        </p>
      </header>

      {/* Barra de progresso */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Pergunta {stepIndex + 1} de {totalSteps}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden bg-line">
          <div
            className="h-full bg-caramel-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card>
        <div>
          <h2 className="font-serif text-2xl text-ink">{currentStep.title}</h2>
          {currentStep.subtitle && (
            <p className="mt-2 text-sm text-muted">{currentStep.subtitle}</p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {currentStep.options.map((opt) => {
              const selected = answers[currentStep.field] === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`flex flex-col items-start gap-1 border px-4 py-3 text-left transition-colors ${
                    selected
                      ? 'border-caramel-500 bg-caramel-100/40'
                      : 'border-line hover:border-caramel-500'
                  }`}
                >
                  <span className="text-sm font-medium text-ink">{opt.label}</span>
                  {opt.hint && <span className="text-xs text-muted">{opt.hint}</span>}
                </button>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="mt-6 flex justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={stepIndex === 0}
          className="text-[11px] font-medium uppercase tracking-caps text-muted hover:text-ink disabled:opacity-40"
        >
          ← Voltar
        </button>
        <button
          type="button"
          onClick={handleRestart}
          className="text-[11px] font-medium uppercase tracking-caps text-muted hover:text-ink"
        >
          Recomeçar
        </button>
      </div>
    </div>
  )
}

export default SimuladorRacaPage
