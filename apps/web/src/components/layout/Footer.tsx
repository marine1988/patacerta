import { Link, useLocation } from 'react-router-dom'
import { LogoMark } from '@/components/shared/LogoMark'
import { SOCIAL_LINKS, type SocialLink } from '@/lib/social'

export function Footer() {
  return (
    <>
      <ResponsibleAdoption />
      <footer className="border-t border-line bg-bg">
        <div className="mx-auto max-w-[72rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-10">
          {/* Editorial top line */}
          <div className="mb-6 flex items-baseline gap-3 sm:mb-8">
            <span className="eyebrow">◆ PataCerta</span>
            <span className="h-px flex-1 bg-line" />
            <span className="eyebrow-muted">Est. 2025 · Portugal</span>
          </div>

          {/* Card de destaque — feedback da comunidade */}
          <Link
            to="/feedback"
            className="card card-hover group mb-6 flex flex-col gap-4 p-5 no-underline sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-8 md:p-6"
          >
            <div className="min-w-0">
              <span className="eyebrow">◆ A sua opinião</span>
              <h3 className="mt-2 font-serif text-xl leading-snug text-ink sm:text-2xl">
                Feedback &amp; <em className="italic text-caramel-500">sugestões</em>
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                Reporte problemas, sugira melhorias ou deixe uma ideia. Cada mensagem é privada: só
                o autor e a equipa a podem ler.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 self-start border border-caramel-500 px-4 py-2.5 text-[10px] font-medium uppercase tracking-caps text-caramel-500 transition-colors group-hover:bg-caramel-500 group-hover:text-white sm:self-auto">
              Dar feedback <span aria-hidden="true">→</span>
            </span>
          </Link>

          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:gap-8">
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
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                O portal dos patudos em Portugal — criadores éticos verificados e serviços de
                confiança, com rigor e transparência.
              </p>
            </div>

            {/* Plataforma */}
            <div>
              <h3 className="eyebrow mb-4 sm:mb-5">— Plataforma</h3>
              <ul className="space-y-2">
                <FooterLink to="/pesquisar">Criadores</FooterLink>
                <FooterLink to="/pesquisar?tipo=servicos">Serviços</FooterLink>
                <FooterLink to="/pesquisar?vista=mapa">Mapa</FooterLink>
                <FooterLink to="/registar">Juntar-me como criador</FooterLink>
                <FooterLink to="/area-pessoal?tab=servicos">Oferecer serviços</FooterLink>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="eyebrow mb-4 sm:mb-5">— Legal</h3>
              <ul className="space-y-2">
                <FooterLink to="/politica-privacidade">Política de Privacidade</FooterLink>
                <FooterLink to="/termos">Termos de Utilização</FooterLink>
                <FooterLink to="/termos-pagamento">Termos de Pagamento</FooterLink>
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(new CustomEvent('patacerta:open-consent-settings'))
                    }
                    // Mesma affordance dos `FooterLink` vizinhos (PATA-UI-FOOTER-2):
                    // o botão é um link por comportamento, não pode ser o único sem
                    // sublinhado. `text-left` fica porque o texto quebra em 2 linhas
                    // na coluna estreita.
                    className="text-left text-sm text-ink underline decoration-caramel-500/40 underline-offset-4 transition-colors hover:text-caramel-500 hover:decoration-caramel-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    Definições de cookies
                  </button>
                </li>
              </ul>
            </div>

            {/* Contacto */}
            <div>
              <h3 className="eyebrow mb-4 sm:mb-5">— Contacto</h3>
              <ul className="space-y-2">
                <li className="text-sm text-muted">info@patacerta.pt</li>
                <li className="text-sm text-muted">Lisboa, Portugal</li>
              </ul>

              {/* Redes sociais — fonte única em `lib/social.ts` */}
              <nav aria-label="Redes sociais" data-testid="footer-social" className="mt-5 sm:mt-6">
                <p className="eyebrow-muted mb-3">Redes</p>
                <ul className="space-y-2">
                  {SOCIAL_LINKS.map((social) => (
                    <li key={social.id}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`PataCerta no ${social.network} — ${social.handle}`}
                        title={social.handle}
                        data-testid={`social-link-${social.id}`}
                        className="inline-flex items-center gap-2 text-sm text-ink underline decoration-caramel-500/40 underline-offset-4 transition-colors hover:text-caramel-500 hover:decoration-caramel-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                      >
                        <SocialIcon id={social.id} />
                        <span>{social.network}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-line pt-5 sm:mt-12 sm:flex-row sm:items-center sm:pt-6">
            <p className="text-[11px] uppercase tracking-caps text-subtle">
              © {new Date().getFullYear()} PataCerta — Todos os direitos reservados.
            </p>
            <p className="text-[11px] uppercase tracking-caps text-subtle">
              Design editorial · Feito em Portugal
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}

/** Ícones de rede social — SVG inline (o repo não tem biblioteca de ícones). */
const SOCIAL_ICON_PATHS: Record<SocialLink['id'], string> = {
  instagram:
    'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
}

function SocialIcon({ id }: { id: SocialLink['id'] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SOCIAL_ICON_PATHS[id]} />
    </svg>
  )
}

function ResponsibleAdoption() {
  return (
    <section
      className="mt-10 border-t border-line bg-bg sm:mt-16 lg:mt-16"
      aria-labelledby="responsible-adoption-title"
    >
      <div className="mx-auto max-w-[72rem] px-6 py-8 sm:py-10 lg:px-8 lg:py-10">
        <div className="grid gap-6 md:grid-cols-[1fr_1.4fr] md:items-start md:gap-8">
          <div>
            <h2 id="responsible-adoption-title" className="eyebrow mb-3">
              ◆ Adopção responsável
            </h2>
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
    </section>
  )
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  const location = useLocation()
  const [targetPath, targetSearch = ''] = to.split('?')
  const isCurrent =
    location.pathname === targetPath &&
    (targetSearch.length === 0
      ? location.search.length === 0
      : location.search === `?${targetSearch}`)

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isCurrent) return
    event.preventDefault()
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth'
    window.scrollTo({ top: 0, behavior })
  }

  return (
    <li>
      <Link
        to={to}
        onClick={handleClick}
        aria-current={isCurrent ? 'page' : undefined}
        className={`text-sm underline decoration-caramel-500/40 underline-offset-4 transition-colors hover:text-caramel-500 hover:decoration-caramel-500 ${
          isCurrent ? 'font-medium text-caramel-500' : 'text-ink'
        }`}
      >
        {children}
      </Link>
    </li>
  )
}
