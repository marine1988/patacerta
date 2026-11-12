import { Card } from '../../components/ui'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../../hooks/usePageMeta'
import { faqPageJsonLd, breadcrumbListJsonLd } from '../../lib/jsonld'
import { Breadcrumbs, type BreadcrumbItem } from '../../components/shared/Breadcrumbs'

/**
 * Página de Perguntas Frequentes — pensada para SEO/GEO. Cada pergunta
 * é também emitida em JSON-LD (FAQPage), o que permite que apareça em
 * "rich results" do Google e seja directamente citada por motores
 * generativos (ChatGPT Search, Perplexity, Google AI Overviews).
 *
 * As perguntas foram escolhidas por:
 * - representarem dúvidas reais de tutores na fase de descoberta;
 * - cobrirem as principais entidades (criador verificado, DGAV, CPC, FCI);
 * - terem respostas curtas, factuais e citáveis (~150-300 caracteres).
 */
interface FaqEntry {
  question: string
  answer: string
}

const FAQS: FaqEntry[] = [
  {
    question: 'O que é a PataCerta?',
    answer:
      'A PataCerta é um directório online que liga tutores a criadores de cães verificados e a prestadores de serviços para cães — treino, banhos, alojamento e transporte — em Portugal. Todos os profissionais apresentam documentação validada.',
  },
  {
    question: 'O que significa "criador verificado" na PataCerta?',
    answer:
      'Um criador verificado apresentou documentação válida (NIF, número DGAV — Direção-Geral de Alimentação e Veterinária — quando aplicável, e dados do canil) que foi revista pela equipa da PataCerta. A verificação confirma a documentação no momento da submissão; não é uma certificação de qualidade.',
  },
  {
    question: 'Como verifico se um criador é legal em Portugal?',
    answer:
      'Em Portugal, os criadores que vendem ninhadas têm de estar registados na DGAV e ter NIF de actividade. Pode pedir o número DGAV ao criador e confirmá-lo no portal oficial. Na PataCerta, o selo «verificado» indica que esses dados foram apresentados.',
  },
  {
    question: 'A PataCerta cobra alguma comissão na compra de um cão?',
    answer:
      'Não. A PataCerta é apenas um directório que liga tutores a criadores e a prestadores de serviços. Toda a transacção é feita directamente entre as partes, sem intermediação financeira da plataforma.',
  },
  {
    question: 'Posso publicar um anúncio na PataCerta gratuitamente?',
    answer:
      'Sim. Criar conta, publicar o perfil de criador e anunciar serviços é gratuito. Os destaques pagos no simulador de raça são opcionais e servem apenas para dar mais visibilidade ao perfil.',
  },
  {
    question: 'Como avalio um criador ou um serviço?',
    answer:
      'Depois de contactar um criador ou um prestador através da PataCerta e de trocarem algumas mensagens, passa a poder deixar uma avaliação pública de 1 a 5 estrelas, com comentário. Só é possível avaliar quem contactou, para que as avaliações correspondam a experiências reais.',
  },
  {
    question: 'O que é o CPC e a FCI?',
    answer:
      'O CPC (Clube Português de Canicultura) é a entidade nacional reconhecida pela FCI (Fédération Cynologique Internationale) para o registo de pedigrees em Portugal. A filiação nestas entidades é um indicador de seriedade na criação selectiva, mas não é obrigatória.',
  },
  {
    question: 'A PataCerta apoia adopção?',
    answer:
      'A PataCerta centra-se em criadores responsáveis e em serviços para cães. Apoiamos a adopção responsável e recomendamos sempre considerar as associações de protecção animal antes de comprar. Estamos a estudar formas de integrar a adopção na plataforma numa fase futura.',
  },
  {
    question: 'Como contacto um criador ou anunciante?',
    answer:
      'Cada perfil de criador e cada anúncio de serviço tem um botão «Enviar mensagem» que abre uma conversa interna na PataCerta. Não partilhamos contactos directos sem o seu consentimento.',
  },
  {
    question: 'Os meus dados pessoais estão seguros?',
    answer:
      'Sim. A PataCerta cumpre o RGPD: consulte a nossa Política de Privacidade para saber que dados recolhemos, com quem os partilhamos e como exercer os seus direitos (acesso, rectificação, eliminação).',
  },
]

export function FaqPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: 'Início', path: '/' },
    { name: 'Perguntas Frequentes', path: '/perguntas-frequentes' },
  ]
  usePageMeta({
    title: 'Perguntas Frequentes',
    description:
      'Respostas às perguntas mais frequentes sobre criadores verificados, serviços para cães, adopção responsável, registo de pedigrees e o funcionamento da PataCerta.',
    canonicalPath: '/perguntas-frequentes',
    jsonLd: [faqPageJsonLd(FAQS), breadcrumbListJsonLd(breadcrumbs)],
  })

  return (
    <div className="page-container">
      <Breadcrumbs items={breadcrumbs} className="mx-auto mb-6 max-w-3xl" />
      <Card className="mx-auto max-w-3xl p-8">
        <h1 className="mb-3 font-serif text-2xl font-bold text-ink">Perguntas Frequentes</h1>
        <p className="mb-8 text-muted">
          Tudo o que precisa de saber sobre criadores verificados, serviços para cães e como
          funciona a PataCerta em Portugal.
        </p>

        <div className="space-y-6">
          {FAQS.map((faq) => (
            <section key={faq.question}>
              <h2 className="mb-2 text-lg font-semibold text-ink">{faq.question}</h2>
              <p className="leading-relaxed text-muted">{faq.answer}</p>
            </section>
          ))}
        </div>

        <div className="mt-10 border-t border-line pt-6 text-sm text-subtle">
          <p>
            Não encontrou a resposta? Consulte os nossos{' '}
            <Link to="/termos" className="text-caramel-700 underline hover:no-underline">
              Termos e Condições
            </Link>{' '}
            ou a{' '}
            <Link
              to="/politica-privacidade"
              className="text-caramel-700 underline hover:no-underline"
            >
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  )
}
