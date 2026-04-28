import { Card } from '../../components/ui'

export function PrivacyPolicyPage() {
  return (
    <div className="container-app py-12">
      <Card className="prose max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Política de Privacidade</h1>
        <p className="text-sm text-gray-500 mb-8">Última atualização: janeiro de 2025</p>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            1. Responsável pelo tratamento
          </h2>
          <p className="text-gray-600 leading-relaxed">
            A PataCerta é responsável pelo tratamento dos dados pessoais recolhidos através desta
            plataforma, em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD) —
            Regulamento (UE) 2016/679.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">2. Dados recolhidos</h2>
          <p className="text-gray-600 leading-relaxed mb-2">
            Recolhemos os seguintes dados pessoais:
          </p>
          <ul className="list-disc pl-6 text-gray-600 space-y-1">
            <li>Nome, e-mail e telefone (no registo)</li>
            <li>NIF e número DGAV (para criadores)</li>
            <li>Documentos de verificação (licenças, certificados)</li>
            <li>Avaliações e mensagens enviadas na plataforma</li>
            <li>Dados de utilização e endereço IP (para segurança)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">3. Finalidade do tratamento</h2>
          <p className="text-gray-600 leading-relaxed">
            Os dados são tratados para: gestão de contas de utilizador, verificação de criadores,
            comunicação entre utilizadores, moderação de conteúdo, cumprimento de obrigações legais
            e melhoria dos serviços.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">4. Direitos dos titulares</h2>
          <p className="text-gray-600 leading-relaxed mb-2">Nos termos do RGPD, tem direito a:</p>
          <ul className="list-disc pl-6 text-gray-600 space-y-1">
            <li>Aceder aos seus dados pessoais</li>
            <li>Solicitar a retificação de dados incorretos</li>
            <li>Solicitar a eliminação dos seus dados</li>
            <li>Solicitar a portabilidade dos dados</li>
            <li>Retirar o consentimento a qualquer momento</li>
            <li>Apresentar reclamação à CNPD</li>
          </ul>
          <p className="text-gray-600 leading-relaxed mt-2">
            Pode exercer estes direitos através da sua área pessoal ou contactando-nos diretamente.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">5. Conservação dos dados</h2>
          <p className="text-gray-600 leading-relaxed">
            Os dados pessoais são conservados enquanto a conta estiver ativa. Após a eliminação da
            conta, os dados são pseudonimizados conforme exigido por lei, mantendo registos de
            auditoria por um período máximo de 5 anos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">6. Contacto</h2>
          <p className="text-gray-600 leading-relaxed">
            Para questões sobre privacidade, contacte-nos através de{' '}
            <a href="mailto:privacidade@patacerta.pt" className="text-caramel-600 hover:underline">
              privacidade@patacerta.pt
            </a>
            .
          </p>
        </section>
      </Card>
    </div>
  )
}
