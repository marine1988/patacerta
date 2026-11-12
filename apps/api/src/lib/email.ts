import { Resend } from 'resend'
import { maskEmail } from './redact.js'
import { getFrontendBaseUrl } from './env.js'

const RESEND_API_KEY = process.env.RESEND_API_KEY
// O remetente TEM de usar um dominio verificado no Resend. O dominio
// verificado e' 'mail.patacerta.pt' (o raiz 'patacerta.pt' NAO esta'
// verificado, pelo que enviar a partir dele devolve 403).
const FROM_EMAIL = process.env.FROM_EMAIL || 'PataCerta <noreply@mail.patacerta.pt>'

let resendClient: Resend | null = null

function isConfigured(): boolean {
  return Boolean(RESEND_API_KEY)
}

function getClient(): Resend | null {
  if (!isConfigured()) return null
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY)
  }
  return resendClient
}

interface SendMailParams {
  to: string
  subject: string
  html: string
  text: string
}

async function sendMail({ to, subject, html, text }: SendMailParams): Promise<void> {
  const safeSubject = sanitizeSubject(subject)
  const client = getClient()
  if (!client) {
    const env = process.env.NODE_ENV
    if (env === 'production' || env === 'stage') {
      console.error(
        `[Email] RESEND_API_KEY nao configurada em ${env}. Email para ${maskEmail(to)} (assunto: ${safeSubject}) NAO foi enviado. Configurar RESEND_API_KEY imediatamente.`,
      )
      return
    }
    console.log(`[Email] (dev) To: ${to} | Subject: ${safeSubject}\n${text}`)
    return
  }
  try {
    await client.emails.send({
      from: FROM_EMAIL,
      to,
      subject: safeSubject,
      html,
      text,
    })
  } catch (err) {
    console.error(`[Email] Failed to send to ${maskEmail(to)}:`, err)
  }
}

/* ==========================================================================
 * Design tokens da marca (espelham tailwind.config: caramel/ink/cream/line).
 * Emails usam estilos inline + tabelas por compatibilidade com clientes.
 * ======================================================================== */
const BRAND = {
  caramel: '#B8895F',
  caramelDeep: '#A07548',
  ink: '#1A1A1A',
  muted: '#5C574E',
  subtle: '#8A837A',
  cream: '#F7F3EC',
  surface: '#FFFFFF',
  line: '#E0D7C6',
}

const SERIF = "Georgia,'Times New Roman',serif"
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/**
 * Escapa caracteres especiais de HTML para evitar injeção de HTML em
 * valores interpolados em templates de email. Usar em TODOS os valores
 * dinâmicos que são inseridos em markup HTML (nomes, URLs, etc.).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Remove CRLF/newlines de um assunto de email (previne header injection). */
function sanitizeSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ').trim()
}

/** Botão de acção "bulletproof" (tabela) na cor da marca. */
function ctaButton(url: string, label: string): string {
  const safeUrl = escapeHtml(url)
  const safeLabel = escapeHtml(label)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
    <tr><td align="center" style="border-radius:10px;background:${BRAND.caramel};">
      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${safeLabel}</a>
    </td></tr>
  </table>`
}

/** Link de recurso quando o botão não funciona. */
function fallbackLink(url: string): string {
  const safeUrl = escapeHtml(url)
  return `<p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${BRAND.subtle};margin:0;">
    Se o botão não funcionar, copie este endereço para o navegador:<br>
    <a href="${safeUrl}" target="_blank" style="color:${BRAND.caramelDeep};word-break:break-all;">${safeUrl}</a>
  </p>`
}

/**
 * Layout base da marca: fundo cream, cartão branco com header (logótipo +
 * wordmark), corpo e rodapé. O logótipo é servido pelo frontend em
 * `/email-logo.png` (PNG porque o Gmail bloqueia SVG).
 */
function baseLayout(title: string, bodyHtml: string): string {
  const base = getFrontendBaseUrl()
  const logoUrl = `${base}/email-logo.png`
  const year = new Date().getFullYear()
  const safeTitle = escapeHtml(title)
  const safeBase = escapeHtml(base)
  const safeLogoUrl = escapeHtml(logoUrl)
  return `<!DOCTYPE html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:36px 32px 18px;">
              <img src="${safeLogoUrl}" width="64" height="64" alt="PataCerta" style="display:block;width:64px;height:64px;border:0;outline:none;text-decoration:none;margin:0 auto 12px;">
              <div style="font-family:${SERIF};font-size:24px;font-weight:700;color:${BRAND.ink};letter-spacing:0.3px;">PataCerta</div>
              <div style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${BRAND.caramel};margin-top:7px;">◆ Criadores verificados · Portugal</div>
            </td>
          </tr>
          <tr><td style="padding:0 32px;"><div style="height:1px;line-height:1px;font-size:0;background:${BRAND.line};">&nbsp;</div></td></tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:${SANS};color:${BRAND.ink};">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 30px;">
              <div style="height:1px;line-height:1px;font-size:0;background:${BRAND.line};margin:18px 0;">&nbsp;</div>
              <p style="font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.subtle};margin:0;">
                Recebeu este email porque tem uma conta na <strong style="color:${BRAND.muted};">PataCerta</strong>. Se não solicitou este pedido, ignore esta mensagem.
              </p>
              <p style="font-family:${SANS};font-size:11px;letter-spacing:1px;color:${BRAND.caramel};margin:12px 0 0;">
                ◆ PATACERTA · <a href="${safeBase}" target="_blank" style="color:${BRAND.subtle};text-decoration:none;">patacerta.pt</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="font-family:${SANS};font-size:11px;color:#B0A99C;margin:16px 0 0;">© ${year} PataCerta — Portugal</p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function heading(text: string): string {
  return `<h1 style="font-family:${SERIF};font-size:21px;font-weight:700;color:${BRAND.ink};margin:0 0 14px;">${text}</h1>`
}

function paragraph(text: string): string {
  return `<p style="font-family:${SANS};font-size:15px;line-height:1.65;color:${BRAND.muted};margin:0 0 10px;">${text}</p>`
}

export async function sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  const subject = 'Confirme o seu email — PataCerta'
  const text = `Bem-vindo à PataCerta!

Para activar a sua conta, abra o link seguinte (válido por 24 horas):
${verificationUrl}

Se não criou esta conta, ignore este email.`
  const html = baseLayout(
    subject,
    `${heading('Bem-vindo à PataCerta!')}
     ${paragraph('Falta só um passo: confirme o seu email para activar a conta e começar a explorar criadores verificados e serviços de confiança.')}
     ${paragraph('O link é válido por <strong style="color:' + BRAND.ink + '">24 horas</strong>.')}
     ${ctaButton(verificationUrl, 'Confirmar email')}
     ${fallbackLink(verificationUrl)}`,
  )
  await sendMail({ to, subject, html, text })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = 'Reposição da palavra-passe — PataCerta'
  const text = `Recebemos um pedido para repor a palavra-passe da sua conta.

Para definir uma nova palavra-passe, abra o link seguinte (válido por 1 hora):
${resetUrl}

Se não solicitou este pedido, ignore este email — a sua palavra-passe permanece inalterada.`
  const html = baseLayout(
    subject,
    `${heading('Repor a sua palavra-passe')}
     ${paragraph('Recebemos um pedido para repor a palavra-passe da sua conta. Clique no botão abaixo para definir uma nova.')}
     ${paragraph('O link é válido por <strong style="color:' + BRAND.ink + '">1 hora</strong>.')}
     ${ctaButton(resetUrl, 'Repor palavra-passe')}
     ${fallbackLink(resetUrl)}
     ${paragraph('Se não solicitou este pedido, ignore este email — a sua palavra-passe permanece inalterada.')}`,
  )
  await sendMail({ to, subject, html, text })
}

interface SponsoredSlotPaidParams {
  breederName: string
  breedName: string
  breedSlug: string
  endsAt: Date
  priceCents: number
  currency: string
  receiptUrl: string | null
}

export async function sendSponsoredSlotPaidEmail(
  to: string,
  params: SponsoredSlotPaidParams,
): Promise<void> {
  const { breederName, breedName, endsAt, priceCents, currency, receiptUrl } = params
  const formattedPrice = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(priceCents / 100)
  const endsAtFmt = endsAt.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  const cleanBreedName = breedName.replace(/[\r\n]+/g, ' ').trim()
  const cleanBreederName = breederName.replace(/[\r\n]+/g, ' ').trim()
  const safeBreedName = escapeHtml(cleanBreedName)
  const safeBreederName = escapeHtml(cleanBreederName)
  const subject = `Destaque activado — ${cleanBreedName} | PataCerta`
  const text = `Olá,

O seu destaque no simulador de raça foi activado.

  Criador: ${cleanBreederName}
  Raça: ${cleanBreedName}
  Activo até: ${endsAtFmt}
  Valor pago: ${formattedPrice}
${receiptUrl ? `\nRecibo: ${receiptUrl}\n` : ''}
A sua ficha aparece agora como criador recomendado para "${cleanBreedName}" no simulador da PataCerta. Pode acompanhar impressões e cliques na sua área pessoal.

Obrigado pelo apoio!
Equipa PataCerta`

  const row = (labelTxt: string, valueTxt: string) =>
    `<tr>
      <td style="padding:6px 14px 6px 0;font-family:${SANS};font-size:14px;color:${BRAND.subtle};">${escapeHtml(labelTxt)}</td>
      <td style="padding:6px 0;font-family:${SANS};font-size:14px;font-weight:600;color:${BRAND.ink};">${escapeHtml(valueTxt)}</td>
    </tr>`

  const html = baseLayout(
    subject,
    `${heading('Destaque activado 🎉')}
     ${paragraph('O seu destaque no simulador de raça foi <strong style="color:' + BRAND.ink + '">activado</strong>.')}
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-collapse:collapse;">
       ${row('Criador', safeBreederName)}
       ${row('Raça', safeBreedName)}
       ${row('Activo até', endsAtFmt)}
       ${row('Valor pago', formattedPrice)}
     </table>
     ${receiptUrl ? ctaButton(receiptUrl, 'Ver recibo') : ''}
     ${paragraph('A sua ficha aparece agora como criador recomendado para <strong style="color:' + BRAND.ink + '">' + safeBreedName + '</strong> no simulador da PataCerta. Pode acompanhar impressões e cliques na sua área pessoal.')}
     ${paragraph('Obrigado pelo apoio!<br>Equipa PataCerta')}`,
  )
  await sendMail({ to, subject, html, text })
}
