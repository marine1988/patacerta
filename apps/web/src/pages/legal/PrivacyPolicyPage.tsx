import { Card } from '../../components/ui'

export function PrivacyPolicyPage() {
  return (
    <div className="container-app py-12">
      <Card className="prose mx-auto max-w-3xl p-8">
        <h1 className="mb-6 font-serif text-2xl font-bold text-ink">Política de Privacidade</h1>
        <p className="mb-8 text-sm text-subtle">Última atualização: 30 de Abril de 2026</p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">1. Responsável pelo tratamento</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta é responsável pelo tratamento dos dados pessoais recolhidos através desta
            plataforma, em conformidade com o Regulamento Geral sobre a Proteção de Dados (RGPD) —
            Regulamento (UE) 2016/679 — e a Lei n.º 58/2019.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">2. Dados recolhidos</h2>
          <p className="mb-2 leading-relaxed text-muted">Recolhemos os seguintes dados pessoais:</p>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>Nome, e-mail e telefone (no registo)</li>
            <li>NIF e número DGAV (para criadores)</li>
            <li>Documentos de verificação (licenças, certificados)</li>
            <li>Avaliações e mensagens enviadas na plataforma</li>
            <li>Dados de utilização e endereço IP (para segurança)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">3. Finalidade do tratamento</h2>
          <p className="leading-relaxed text-muted">
            Os dados são tratados para: gestão de contas de utilizador, verificação de criadores,
            comunicação entre utilizadores, moderação de conteúdo, cumprimento de obrigações legais
            e melhoria dos serviços.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">4. Direitos dos titulares</h2>
          <p className="mb-2 leading-relaxed text-muted">Nos termos do RGPD, tem direito a:</p>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>Aceder aos seus dados pessoais</li>
            <li>Solicitar a retificação de dados incorretos</li>
            <li>Solicitar a eliminação dos seus dados</li>
            <li>Solicitar a portabilidade dos dados</li>
            <li>Retirar o consentimento a qualquer momento</li>
            <li>Apresentar reclamação à CNPD</li>
          </ul>
          <p className="mt-2 leading-relaxed text-muted">
            Pode exercer estes direitos através da sua área pessoal ou contactando-nos diretamente.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">
            5. Cookies e tecnologias semelhantes
          </h2>
          <p className="mb-2 leading-relaxed text-muted">
            Utilizamos cookies e tecnologias equivalentes (localStorage) para o funcionamento do
            site e, com o seu consentimento expresso, para estatísticas e publicidade. Antes de
            qualquer cookie não essencial ser activado, pedimos-lhe consentimento através do banner
            que aparece na primeira visita.
          </p>
          <p className="mb-2 leading-relaxed text-muted">
            Dividimos os cookies em três categorias:
          </p>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>
              <strong className="text-ink">Estritamente necessários</strong> — sessão, segurança e
              preferências mínimas. Não podem ser desactivados.
            </li>
            <li>
              <strong className="text-ink">Estatísticas</strong> — ajudam-nos a perceber como o site
              é usado, de forma agregada e anónima.
            </li>
            <li>
              <strong className="text-ink">Marketing e publicidade</strong> — permitem mostrar
              anúncios relevantes através do Google AdSense, com base na sua actividade. Sem este
              consentimento, mostramos apenas anúncios genéricos (não personalizados).
            </li>
          </ul>
          <p className="mt-2 leading-relaxed text-muted">
            Pode mudar a sua decisão a qualquer momento clicando em{' '}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent('patacerta:open-consent-settings'))
              }
              className="text-caramel-700 underline underline-offset-2 hover:text-caramel-500"
            >
              Definições de cookies
            </button>{' '}
            (também disponível no rodapé). Para fins de auditoria RGPD, mantemos um registo
            anonimizado das decisões de consentimento (data, versão da política, categorias
            aceites), associado a um identificador aleatório local — nunca a dados pessoais
            directos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">6. Conservação dos dados</h2>
          <p className="leading-relaxed text-muted">
            Os dados pessoais são conservados enquanto a conta estiver ativa. Após a eliminação da
            conta, os dados são pseudonimizados conforme exigido por lei, mantendo registos de
            auditoria por um período máximo de 5 anos. Os registos de consentimento de cookies são
            conservados pelo mesmo período, para prova de cumprimento perante a CNPD.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">7. Contacto</h2>
          <p className="leading-relaxed text-muted">
            Para questões sobre privacidade, contacte-nos através de{' '}
            <a href="mailto:privacidade@patacerta.pt" className="text-caramel-700 hover:underline">
              privacidade@patacerta.pt
            </a>
            .
          </p>
        </section>
      </Card>
    </div>
  )
}
