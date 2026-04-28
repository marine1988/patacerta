import { Card } from '../../components/ui'

export function TermsPage() {
  return (
    <div className="container-app py-12">
      <Card className="prose max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Termos e Condições</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: janeiro de 2025</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">1. Objeto</h2>
          <p className="text-gray-600 leading-relaxed">
            A PataCerta é uma plataforma online que liga tutores de animais a criadores verificados
            em Portugal. Estes termos regulam o acesso e utilização da plataforma.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">2. Registo e conta</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-1">
            <li>O registo é gratuito e requer informações verdadeiras</li>
            <li>Cada utilizador pode ter apenas uma conta</li>
            <li>É responsável pela segurança das suas credenciais</li>
            <li>Criadores devem fornecer NIF válido e documentação DGAV quando aplicável</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">3. Verificação de criadores</h2>
          <p className="text-gray-600 leading-relaxed">
            A PataCerta verifica a documentação submetida pelos criadores, mas não garante a
            qualidade dos serviços prestados. A verificação confirma apenas que o criador apresentou
            documentação válida no momento da submissão.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">4. Avaliações e conteúdo</h2>
          <ul className="list-disc pl-6 text-gray-600 space-y-1">
            <li>As avaliações devem ser honestas e baseadas em experiência real</li>
            <li>É proibido conteúdo ofensivo, difamatório ou que viole direitos de terceiros</li>
            <li>
              A PataCerta reserva-se o direito de moderar ou remover conteúdo que viole estas regras
            </li>
            <li>Criadores podem responder a avaliações de forma profissional</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">5. Responsabilidade</h2>
          <p className="text-gray-600 leading-relaxed">
            A PataCerta atua como intermediário e não é parte em qualquer transação entre
            utilizadores e criadores. Não somos responsáveis por disputas, danos ou perdas
            resultantes de interações entre utilizadores.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">6. Suspensão e eliminação</h2>
          <p className="text-gray-600 leading-relaxed">
            Reservamo-nos o direito de suspender ou eliminar contas que violem estes termos. Pode
            solicitar a eliminação da sua conta a qualquer momento através da sua área pessoal.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">7. Lei aplicável</h2>
          <p className="text-gray-600 leading-relaxed">
            Estes termos são regidos pela lei portuguesa. Qualquer litígio será submetido aos
            tribunais competentes de Portugal.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">8. Contacto</h2>
          <p className="text-gray-600 leading-relaxed">
            Para questões sobre estes termos, contacte-nos através de{' '}
            <a href="mailto:suporte@patacerta.pt" className="text-caramel-600 hover:underline">
              suporte@patacerta.pt
            </a>
            .
          </p>
        </section>
      </Card>
    </div>
  )
}
