import { Card } from '../../components/ui'

export function TermsPage() {
  return (
    <div className="container-app py-12">
      <Card className="prose mx-auto max-w-3xl p-8">
        <h1 className="mb-6 font-serif text-2xl font-bold text-ink">Termos e Condições</h1>
        <p className="mb-8 text-sm text-subtle">Última atualização: janeiro de 2025</p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">1. Objeto</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta é uma plataforma online que liga tutores de animais a criadores verificados
            em Portugal. Estes termos regulam o acesso e utilização da plataforma.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">2. Registo e conta</h2>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>O registo é gratuito e requer informações verdadeiras</li>
            <li>Cada utilizador pode ter apenas uma conta</li>
            <li>É responsável pela segurança das suas credenciais</li>
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
            <li>Criadores podem responder a avaliações de forma profissional</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">5. Responsabilidade</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta atua como intermediário e não é parte em qualquer transação entre
            utilizadores e criadores. Não somos responsáveis por disputas, danos ou perdas
            resultantes de interações entre utilizadores.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">6. Suspensão e eliminação</h2>
          <p className="leading-relaxed text-muted">
            Reservamo-nos o direito de suspender ou eliminar contas que violem estes termos. Pode
            solicitar a eliminação da sua conta a qualquer momento através da sua área pessoal.
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
