import { Card } from '../../components/ui'
import { usePageMeta } from '../../hooks/usePageMeta'
import { faqPageJsonLd, breadcrumbListJsonLd } from '../../lib/jsonld'

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
      'A PataCerta é um directório online de criadores de cães verificados e serviços relacionados (treino, banhos, hospedagem, transporte) em Portugal. Liga tutores a profissionais com documentação validada.',
  },
  {
    question: 'O que significa "criador verificado" na PataCerta?',
    answer:
      'Um criador verificado submeteu documentação válida — NIF, número DGAV (Direcção-Geral de Alimentação e Veterinária) quando aplicável, e dados do canil — que foi revista pela equipa da PataCerta. A verificação confirma a documentação no momento de submissão; não é uma certificação de qualidade.',
  },
  {
    question: 'Como verifico se um criador é legal em Portugal?',
    answer:
      'Em Portugal, criadores que vendam ninhadas têm de estar registados na DGAV e ter NIF de actividade. Pode pedir o número DGAV ao criador e confirmar no portal oficial. Na PataCerta, o selo "verificado" indica que esses dados foram apresentados.',
  },
  {
    question: 'A PataCerta cobra alguma comissão na compra de um cão?',
    answer:
      'Não. A PataCerta é apenas um directório que liga tutores a criadores e prestadores de serviços. Toda a transacção é feita directamente entre as partes, sem intermediação financeira da plataforma.',
  },
  {
    question: 'Posso publicar um anúncio na PataCerta gratuitamente?',
    answer:
      'Sim. Criar conta, publicar perfil de criador e publicar anúncios de serviços é gratuito. Funcionalidades premium poderão surgir no futuro mas serão sempre opcionais.',
  },
  {
    question: 'Como avalio um criador ou um serviço?',
    answer:
      'Após contactar um criador ou prestador através da PataCerta e trocarem mensagens (mínimo configurável de cada lado, dentro de uma janela temporal), fica elegível para deixar uma avaliação pública de 1 a 5 estrelas com comentário.',
  },
  {
    question: 'O que é o CPC e a FCI?',
    answer:
      'O CPC (Clube Português de Canicultura) é a entidade nacional reconhecida pela FCI (Fédération Cynologique Internationale) para registo de pedigrees em Portugal. Filiação a estas entidades é um indicador de seriedade na criação selectiva, mas não é obrigatória.',
  },
  {
    question: 'A PataCerta apoia adopção?',
    answer:
      'A PataCerta foca-se em criadores responsáveis e serviços para cães. Apoiamos a adopção responsável e recomendamos sempre considerar associações de protecção animal antes da compra. Estamos a estudar formas de integrar adopção numa fase futura.',
  },
  {
    question: 'Como contacto um criador ou anunciante?',
    answer:
      'Cada perfil de criador e cada anúncio de serviço tem um botão "Enviar mensagem" que abre uma conversa interna na PataCerta. Não partilhamos contactos directos sem consentimento.',
  },
  {
    question: 'Os meus dados pessoais estão seguros?',
    answer:
      'Sim. A PataCerta cumpre o RGPD: pode consultar a nossa Política de Privacidade para detalhes sobre que dados recolhemos, com quem os partilhamos e como exercer os seus direitos (acesso, rectificação, eliminação).',
  },
]

export function FaqPage() {
  usePageMeta({
    title: 'Perguntas Frequentes',
    description:
      'Respostas às perguntas mais comuns sobre criadores verificados, serviços para cães, adopção, registo de pedigrees e como funciona a PataCerta.',
    canonicalPath: '/perguntas-frequentes',
    jsonLd: [
      faqPageJsonLd(FAQS),
      breadcrumbListJsonLd([
        { name: 'Início', path: '/' },
        { name: 'Perguntas Frequentes', path: '/perguntas-frequentes' },
      ]),
    ],
  })

  return (
    <div className="container-app py-12">
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
            <a href="/termos" className="text-caramel-700 underline hover:no-underline">
              Termos e Condições
            </a>{' '}
            ou a{' '}
            <a
              href="/politica-privacidade"
              className="text-caramel-700 underline hover:no-underline"
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>
      </Card>
    </div>
  )
}
