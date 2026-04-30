import { Link } from 'react-router-dom'
import { LogoMark } from '@/components/shared/LogoMark'

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
              className="group inline-flex items-center gap-3 font-serif text-2xl tracking-tight text-ink transition-colors hover:text-caramel-700"
            >
              <LogoMark size={32} className="transition-transform group-hover:scale-105" />
              <span>
                Pata<em className="italic text-caramel-500">Certa</em>
              </span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted">
              O portal dos patudos em Portugal — criadores éticos verificados e serviços de
              confiança, com rigor e transparência.
            </p>
          </div>

          {/* Plataforma */}
          <div>
            <h3 className="eyebrow mb-5">— Plataforma</h3>
            <ul className="space-y-3">
              <FooterLink to="/pesquisar">Criadores</FooterLink>
              <FooterLink to="/pesquisar?tipo=servicos">Serviços</FooterLink>
              <FooterLink to="/pesquisar?vista=mapa">Mapa</FooterLink>
              <FooterLink to="/registar">Juntar-me como criador</FooterLink>
              <FooterLink to="/area-pessoal?tab=servicos">Oferecer serviços</FooterLink>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="eyebrow mb-5">— Legal</h3>
            <ul className="space-y-3">
              <FooterLink to="/politica-privacidade">Política de Privacidade</FooterLink>
              <FooterLink to="/termos">Termos de Utilização</FooterLink>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="eyebrow mb-5">— Contacto</h3>
            <ul className="space-y-3">
              <li className="text-sm text-muted">info@patacerta.pt</li>
              <li className="text-sm text-muted">Lisboa, Portugal</li>
            </ul>
          </div>
        </div>

        {/* Adopção responsável */}
        <div className="mt-16 border-t border-line pt-10">
          <div className="grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-start md:gap-12">
            <div>
              <h3 className="eyebrow mb-3">◆ Adopção responsável</h3>
              <p className="font-serif text-lg leading-snug text-ink">
                Comprar a um criador ético é legítimo —{' '}
                <em className="italic text-caramel-500">adoptar também</em>.
              </p>
            </div>
            <div>
              <p className="text-sm leading-relaxed text-muted">
                Antes de procurar um criador, considere visitar uma associação. Muitos cães à espera
                de família encaixam no mesmo perfil que o simulador sugere — incluindo cachorros,
                raças puras e mestiços com excelentes temperamentos.
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <li>
                  <a
                    href="https://www.uniaozoofila.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink underline decoration-caramel-500/40 underline-offset-4 transition-colors hover:text-caramel-500 hover:decoration-caramel-500"
                  >
                    União Zoófila
                  </a>
                </li>
                <li>
                  <a
                    href="https://animaisderua.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink underline decoration-caramel-500/40 underline-offset-4 transition-colors hover:text-caramel-500 hover:decoration-caramel-500"
                  >
                    Animais de Rua
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.sosanimal.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-ink underline decoration-caramel-500/40 underline-offset-4 transition-colors hover:text-caramel-500 hover:decoration-caramel-500"
                  >
                    SOS Animal
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
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
