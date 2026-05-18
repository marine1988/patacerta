/**
 * Auto-linkifies URLs in plain text. Safe by default:
 *   - Only http:// and https:// schemes accepted (no javascript: or data:)
 *   - Uses <a rel="noopener noreferrer nofollow ugc" target="_blank">
 *   - Preserves whitespace-pre-wrap semantics by passing through non-URL text as-is
 *
 * We intentionally keep the regex conservative to avoid false positives.
 * Trailing punctuation (. , ; : ! ? )) is stripped from the matched URL and
 * appended back as plain text.
 *
 * Regex e' instanciada localmente em cada render porque flag `g` mantem
 * `lastIndex` no objecto regex — partilhar entre renders concorrentes
 * (React Concurrent Mode) podia produzir matches inconsistentes.
 */

const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/

function splitUrl(match: string): { url: string; trailing: string } {
  const m = match.match(TRAILING_PUNCT_RE)
  if (!m) return { url: match, trailing: '' }
  return {
    url: match.slice(0, match.length - m[0].length),
    trailing: m[0],
  }
}

interface Props {
  text: string
  className?: string
  linkClassName?: string
}

export function LinkifiedText({ text, className, linkClassName }: Props) {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let key = 0

  // Instancia local — evita estado partilhado entre renders.
  const urlRe = /\bhttps?:\/\/[^\s<>"']+/gi

  let match: RegExpExecArray | null
  while ((match = urlRe.exec(text)) !== null) {
    const start = match.index
    const raw = match[0]
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))

    const { url, trailing } = splitUrl(raw)
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        className={
          linkClassName ?? 'underline decoration-dotted underline-offset-2 hover:decoration-solid'
        }
      >
        {url}
      </a>,
    )
    if (trailing) nodes.push(trailing)

    lastIndex = start + raw.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))

  return <span className={className}>{nodes}</span>
}
