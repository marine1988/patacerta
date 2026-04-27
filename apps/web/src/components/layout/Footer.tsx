import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line bg-bg">
      <div className="mx-auto max-w-[72rem] px-6 py-16 lg:px-8">
        {/* Editorial top line */}
        <div className="mb-12 flex items-baseline gap-3">
          <span className="eyebrow">◆ PataCerta</span>
          <span className="h-px flex-1 bg-line" />
          <span className="eyebrow-muted">Est. 2025 · Portugal</span>
        </div>

        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand statement */}
          <div>
            <Link
              to="/"
              className="font-serif text-2xl tracking-tight text-ink transition-colors hover:text-caramel-700"
            >
              Pata<em className="italic text-caramel-500">Certa</em>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              O portal dos patudos em Portugal — criadores éticos verificados e serviços de
              confiança, com rigor e transparência.
            </p>
          </div>

          {/* Plataforma */}
          <div>
            <h4 className="eyebrow mb-5">— Plataforma</h4>
            <ul className="space-y-3">
              <FooterLink to="/diretorio">Diretório</FooterLink>
              <FooterLink to="/servicos">Serviços</FooterLink>
              <FooterLink to="/mapa">Mapa</FooterLink>
              <FooterLink to="/registar">Juntar-me como criador</FooterLink>
              <FooterLink to="/painel?tab=servicos">Oferecer serviços</FooterLink>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="eyebrow mb-5">— Legal</h4>
            <ul className="space-y-3">
              <FooterLink to="/politica-privacidade">Política de Privacidade</FooterLink>
              <FooterLink to="/termos">Termos de Utilização</FooterLink>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h4 className="eyebrow mb-5">— Contacto</h4>
            <ul className="space-y-3">
              <li className="text-sm text-muted">info@patacerta.pt</li>
              <li className="text-sm text-muted">Lisboa, Portugal</li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="text-[11px] uppercase tracking-caps text-subtle">
            © {new Date().getFullYear()} PataCerta — Todos os direitos reservados.
          </p>
          <p className="text-[11px] uppercase tracking-caps text-subtle">
            Design editorial · Feito em Portugal
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="text-sm text-ink transition-colors hover:text-caramel-500">
        {children}
      </Link>
    </li>
  )
}
