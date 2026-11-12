import { Card } from '../../components/ui'
import { usePageMeta } from '../../hooks/usePageMeta'
import { breadcrumbListJsonLd } from '../../lib/jsonld'
import { Breadcrumbs, type BreadcrumbItem } from '../../components/shared/Breadcrumbs'

export function TermsPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: 'Início', path: '/' },
    { name: 'Termos e Condições', path: '/termos' },
  ]
  usePageMeta({
    title: 'Termos e Condições',
    description:
      'Termos e condições de utilização da PataCerta — directório de criadores verificados e de serviços para cães em Portugal, com as regras de conta, conteúdo e avaliações.',
    canonicalPath: '/termos',
    jsonLd: breadcrumbListJsonLd(breadcrumbs),
  })

  return (
    <div className="page-container">
      <Breadcrumbs items={breadcrumbs} className="mx-auto mb-6 max-w-3xl" />
      <Card className="mx-auto max-w-3xl p-5 sm:p-8">
        <h1 className="mb-6 font-serif text-2xl font-bold text-ink">Termos e Condições</h1>
        <p className="mb-8 text-sm text-subtle">Última actualização: janeiro de 2025</p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">1. Objeto</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta é uma plataforma online que liga tutores de animais a criadores verificados
            e a prestadores de serviços para cães em Portugal. Estes termos regulam o acesso e a
            utilização da plataforma por criadores, prestadores de serviços e tutores.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">2. Registo e conta</h2>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>O registo é gratuito e exige informações verdadeiras e actualizadas</li>
            <li>Cada utilizador pode ter apenas uma conta</li>
            <li>O utilizador é responsável por manter as suas credenciais seguras</li>
            <li>Criadores devem fornecer NIF válido e documentação DGAV quando aplicável</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">3. Verificação de criadores</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta verifica a documentação submetida pelos criadores, mas não garante a
            qualidade dos serviços prestados. A verificação confirma apenas que o criador apresentou
            documentação válida no momento da submissão.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">4. Avaliações e conteúdo</h2>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>As avaliações devem ser honestas e baseadas em experiência real</li>
            <li>É proibido conteúdo ofensivo, difamatório ou que viole direitos de terceiros</li>
            <li>
              A PataCerta reserva-se o direito de moderar ou remover conteúdo que viole estas regras
            </li>
            <li>Criadores e prestadores de serviços podem responder a avaliações</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">5. Responsabilidade</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta disponibiliza a plataforma e não é parte em qualquer transacção entre
            tutores, criadores e prestadores de serviços. Não somos responsáveis por disputas, danos
            ou perdas resultantes de interacções entre utilizadores.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">6. Suspensão e eliminação</h2>
          <p className="leading-relaxed text-muted">
            Reservamo-nos o direito de suspender ou eliminar contas que violem estes termos. Pode
            pedir a eliminação da sua conta a qualquer momento, na sua área pessoal.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">7. Lei aplicável</h2>
          <p className="leading-relaxed text-muted">
            Estes termos são regidos pela lei portuguesa. Qualquer litígio será submetido aos
            tribunais competentes de Portugal.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">8. Contacto</h2>
          <p className="leading-relaxed text-muted">
            Para questões sobre estes termos, contacte-nos através de{' '}
            <a href="mailto:suporte@patacerta.pt" className="link-inline">
              suporte@patacerta.pt
            </a>
            .
          </p>
        </section>
      </Card>
    </div>
  )
}
