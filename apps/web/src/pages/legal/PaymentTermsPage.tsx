import { Card } from '../../components/ui'
import { Link } from 'react-router-dom'
import { usePageMeta } from '../../hooks/usePageMeta'
import { breadcrumbListJsonLd } from '../../lib/jsonld'
import { Breadcrumbs, type BreadcrumbItem } from '../../components/shared/Breadcrumbs'

export function PaymentTermsPage() {
  const breadcrumbs: BreadcrumbItem[] = [
    { name: 'Início', path: '/' },
    { name: 'Termos de Pagamento', path: '/termos-pagamento' },
  ]
  usePageMeta({
    title: 'Termos de Pagamento — Sponsored Slots',
    description:
      'Condições comerciais dos Sponsored Slots da PataCerta: preço, duração, métodos de pagamento, política de reembolso e IVA.',
    canonicalPath: '/termos-pagamento',
    jsonLd: breadcrumbListJsonLd(breadcrumbs),
  })

  return (
    <div className="container-app py-12">
      <Breadcrumbs items={breadcrumbs} className="mx-auto mb-6 max-w-3xl" />
      <Card className="prose mx-auto max-w-3xl p-8">
        <h1 className="mb-6 font-serif text-2xl font-bold text-ink">
          Termos de Pagamento — Sponsored Slots
        </h1>
        <p className="mb-8 text-sm text-subtle">Última actualização: maio de 2026</p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">1. O que é um Sponsored Slot</h2>
          <p className="leading-relaxed text-muted">
            Um <strong>Sponsored Slot</strong> é um espaço de destaque pago no simulador de raça da
            PataCerta. Quando um utilizador visita a página de uma raça, vê em primeiro lugar os
            criadores dessa raça que adquiriram um slot activo, seguidos pelos restantes resultados
            por critérios orgânicos (verificação, distância, avaliações).
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            Os Sponsored Slots são <strong>opcionais</strong>. A presença na PataCerta, o badge de
            verificação e a aparição em resultados orgânicos são totalmente gratuitos.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">2. Preço e duração</h2>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>
              <strong>Preço:</strong> 10,00 € por slot, por raça, por período (IVA incluído à taxa
              em vigor em Portugal).
            </li>
            <li>
              <strong>Duração:</strong> 30 dias consecutivos a contar do momento da confirmação do
              pagamento.
            </li>
            <li>
              <strong>Limite por raça:</strong> no máximo 3 slots simultaneamente activos por cada
              raça. Quando os 3 estão ocupados, novos pedidos para essa raça ficam temporariamente
              indisponíveis até um expirar.
            </li>
            <li>
              <strong>Sem renovação automática:</strong> o slot termina automaticamente ao fim dos
              30 dias. Para continuar destacado, é necessário comprar um novo slot.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">3. Métodos de pagamento</h2>
          <p className="leading-relaxed text-muted">
            O pagamento é processado pela <strong>Stripe Payments Europe, Ltd.</strong>, prestador
            de serviços de pagamento autorizado pela autoridade reguladora irlandesa. A PataCerta
            <strong> não armazena</strong> dados de cartão nem credenciais bancárias.
          </p>
          <p className="mt-3 leading-relaxed text-muted">Métodos disponíveis:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-muted">
            <li>Cartão de crédito ou débito (Visa, Mastercard, American Express)</li>
            <li>Multibanco (referência válida durante o prazo definido pela Stripe)</li>
            <li>MB WAY</li>
            <li>Google Pay (quando suportado pelo dispositivo)</li>
          </ul>
          <p className="mt-3 leading-relaxed text-muted">
            Pagamentos por Multibanco e MB WAY podem demorar minutos a algumas horas a confirmar. O
            slot só é activado <strong>após confirmação do pagamento</strong> pela Stripe — não no
            momento da geração da referência.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">4. Activação do slot</h2>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>
              Ao iniciar o checkout, criamos um slot com estado <em>pendente</em> que reserva um dos
              3 lugares da raça por até 24 horas.
            </li>
            <li>
              Após a Stripe confirmar o pagamento, o slot fica <em>activo</em> e o contador de 30
              dias começa.
            </li>
            <li>
              Se o pagamento falhar ou expirar (referência não paga a tempo, cartão recusado), o
              slot é libertado e poderá comprar novamente.
            </li>
            <li>
              Receberá um email de confirmação com o recibo da Stripe assim que o pagamento for
              processado.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">5. Política de reembolso</h2>
          <p className="leading-relaxed text-muted">
            Os Sponsored Slots são um serviço digital de execução imediata. Nos termos do{' '}
            <strong>artigo 17.º, n.º 1, alínea m)</strong> do Decreto-Lei n.º 24/2014 (direitos do
            consumidor em contratos à distância), o direito de livre resolução{' '}
            <strong>não se aplica</strong> a serviços digitais cuja prestação tenha sido iniciada
            com o consentimento prévio e expresso do consumidor.
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            Sem prejuízo do anterior, a PataCerta processará reembolsos integrais nos seguintes
            casos:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-muted">
            <li>Erro técnico que impeça a activação ou exibição correcta do slot pago</li>
            <li>Cobrança duplicada por falha do sistema</li>
            <li>Suspensão da conta de criador por motivos não imputáveis ao próprio</li>
          </ul>
          <p className="mt-3 leading-relaxed text-muted">
            Pedidos de reembolso devem ser feitos por escrito para{' '}
            <a href="mailto:suporte@patacerta.pt" className="link-inline">
              suporte@patacerta.pt
            </a>{' '}
            no prazo de 14 dias após o evento. Reembolsos são creditados no método de pagamento
            original em 5 a 10 dias úteis (dependente da Stripe e do banco emissor).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">6. Facturação e IVA</h2>
          <ul className="list-disc space-y-1 pl-6 text-muted">
            <li>
              O preço de 10,00 € inclui IVA à taxa em vigor em Portugal (actualmente 23%) sempre que
              aplicável.
            </li>
            <li>
              O recibo emitido pela Stripe (enviado por email) serve como comprovativo de pagamento.
            </li>
            <li>
              Para emissão de factura com NIF, indique o NIF no perfil de criador antes do checkout.
              A factura formal é processada pela PataCerta e enviada por email no prazo de 5 dias
              úteis após confirmação do pagamento.
            </li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">7. Conteúdo do slot</h2>
          <p className="leading-relaxed text-muted">
            O conteúdo exibido no Sponsored Slot é o do perfil público de criador (nome, badge,
            morada, telefone, raças). A PataCerta reserva-se o direito de remover ou suspender slots
            cujo perfil viole os{' '}
            <Link to="/termos" className="link-inline">
              Termos e Condições gerais
            </Link>{' '}
            (informação falsa, violação dos direitos animais, conteúdo ofensivo). Nestes casos não
            há reembolso do tempo restante.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">8. Métricas e desempenho</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta regista impressões e cliques nos slots activos para fins estatísticos
            agregados. Estas métricas estão disponíveis ao criador no Dashboard. A PataCerta{' '}
            <strong>não garante</strong> um número mínimo de impressões, cliques ou contactos
            resultantes do destaque — o resultado depende do volume de tráfego orgânico da raça e
            qualidade do perfil.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">9. Alterações destes termos</h2>
          <p className="leading-relaxed text-muted">
            A PataCerta pode actualizar estes termos para reflectir alterações de preço,
            funcionalidade ou conformidade legal. Slots já comprados regem-se pelos termos vigentes
            no momento da compra. Alterações futuras só se aplicam a novos slots.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-ink">10. Contacto</h2>
          <p className="leading-relaxed text-muted">
            Para questões sobre pagamentos, facturação ou reembolsos, contacte{' '}
            <a href="mailto:suporte@patacerta.pt" className="link-inline">
              suporte@patacerta.pt
            </a>
            . Para questões sobre o processamento do pagamento em si, pode também contactar a Stripe
            através de{' '}
            <a
              href="https://support.stripe.com"
              target="_blank"
              rel="noopener noreferrer"
              className="link-inline"
            >
              support.stripe.com
            </a>
            .
          </p>
        </section>
      </Card>
    </div>
  )
}
