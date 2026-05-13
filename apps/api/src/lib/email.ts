import nodemailer, { type Transporter } from 'nodemailer'
import { maskEmail } from './redact.js'

/**
 * Escapa caracteres HTML especiais para impedir injecao em templates de
 * email. Usado em qualquer valor que venha de input do utilizador antes
 * de ser interpolado no corpo HTML (nome do criador, raca, etc).
 *
 * Defense-in-depth: hoje os campos passam por validacao Zod (no script
 * tags), mas o escape garante que mesmo um valor como `</a><b>x</b>` e'
 * renderizado como texto literal pelos clientes de email.
 *
 * Nao usa DOMPurify porque o input aqui e' texto plano, nao HTML — basta
 * escapar os 5 chars perigosos (HTML5 spec).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Escapa um URL para uso seguro em atributo href. Recusa schemes
 * perigosos (javascript:, data:, vbscript:) devolvendo `#` — mantem o
 * email visualmente intacto mas neutraliza payloads.
 *
 * URLs em emails sao sempre gerados pelo backend (verification/reset
 * tokens, Stripe receipt URLs); este wrapper e' defense-in-depth caso
 * alguma fonte futura (ex.: receiptUrl de webhook) traga algo inesperado.
 */
function escapeHtmlAttr(value: string): string {
  const trimmed = value.trim()
  // Blocklist de schemes perigosos para uso em href.
  const dangerous = /^(javascript|data|vbscript|file):/i
  if (dangerous.test(trimmed)) return '#'
  return escapeHtml(trimmed)
}

/**
 * Email transport via nodemailer + generic SMTP.
 *
 * Configuration via env vars:
 *   SMTP_HOST     — e.g. smtp.gmail.com, smtp.mailgun.org, email-smtp.eu-west-1.amazonaws.com
 *   SMTP_PORT     — default 587
 *   SMTP_SECURE   — "true" for port 465 (TLS), "false" for 587 (STARTTLS). Default false.
 *   SMTP_USER     — SMTP username
 *   SMTP_PASS     — SMTP password / app password / API key
 *   SMTP_FROM     — From header, e.g. "Patacerta <noreply@patacerta.pt>"
 *
 * If SMTP_HOST is not set, emails are logged to console and `sendMail` resolves
 * successfully. Keeps local dev frictionless.
 */

let cachedTransporter: Transporter | null = null
let transportConfigured: boolean | null = null

function isConfigured(): boolean {
  if (transportConfigured !== null) return transportConfigured
  transportConfigured = Boolean(process.env.SMTP_HOST)
  return transportConfigured
}

function getTransporter(): Transporter | null {
  if (!isConfigured()) return null
  if (cachedTransporter) return cachedTransporter

  const port = Number(process.env.SMTP_PORT || 587)
  const secure =
    process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || port === 465

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  })

  return cachedTransporter
}

function getFrom(): string {
  return process.env.SMTP_FROM || 'Patacerta <noreply@patacerta.pt>'
}

interface SendMailParams {
  to: string
  subject: string
  html: string
  text: string
}

async function sendMail({ to, subject, html, text }: SendMailParams): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.log(`[Email] (dev) To: ${to} | Subject: ${subject}\n${text}`)
    return
  }
  try {
    await transporter.sendMail({ from: getFrom(), to, subject, html, text })
  } catch (err) {
    // Never break the calling flow because of email failure.
    console.error(`[Email] Failed to send to ${maskEmail(to)}:`, err)
  }
}

function baseLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-PT">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#1f2937">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">Patacerta</h1>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0" />
      <p style="font-size:12px;color:#6b7280;margin:0">
        Recebeu este email porque tem uma conta em Patacerta. Se não foi você, ignore esta mensagem.
      </p>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  const subject = 'Confirme o seu email — Patacerta'
  const text = `Bem-vindo à Patacerta!

Para ativar a sua conta, abra o seguinte link (válido por 24 horas):
${verificationUrl}

Se não criou esta conta, ignore este email.`
  const safeUrl = escapeHtmlAttr(verificationUrl)
  const html = baseLayout(
    subject,
    `<p>Bem-vindo à <strong>Patacerta</strong>!</p>
     <p>Para ativar a sua conta, clique no botão abaixo. O link é válido por 24 horas.</p>
     <p style="margin:24px 0">
       <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Confirmar email</a>
     </p>
     <p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço para o navegador:<br><span style="word-break:break-all">${safeUrl}</span></p>`,
  )
  await sendMail({ to, subject, html, text })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = 'Reposição da palavra-passe — Patacerta'
  const text = `Recebemos um pedido para repor a palavra-passe da sua conta.

Para definir uma nova palavra-passe, abra o seguinte link (válido por 1 hora):
${resetUrl}

Se não foi você, ignore este email — a sua palavra-passe permanece inalterada.`
  const safeUrl = escapeHtmlAttr(resetUrl)
  const html = baseLayout(
    subject,
    `<p>Recebemos um pedido para repor a palavra-passe da sua conta.</p>
     <p>Para definir uma nova palavra-passe, clique no botão abaixo. O link é válido por 1 hora.</p>
     <p style="margin:24px 0">
       <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Repor palavra-passe</a>
     </p>
     <p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço para o navegador:<br><span style="word-break:break-all">${safeUrl}</span></p>
     <p style="font-size:13px;color:#6b7280">Se não foi você, ignore este email — a sua palavra-passe permanece inalterada.</p>`,
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

/**
 * Email enviado quando um Sponsored Slot é confirmado pelo Stripe
 * (cartão imediatamente, ou Multibanco quando a referência é paga).
 *
 * Conteúdo: confirmação do destaque activo, raça onde aparece, prazo
 * (data fim), valor pago, link para recibo Stripe (quando disponível).
 */
export async function sendSponsoredSlotPaidEmail(
  to: string,
  params: SponsoredSlotPaidParams,
): Promise<void> {
  const { breederName, breedName, endsAt, priceCents, currency, receiptUrl } = params
  const formattedPrice = `${(priceCents / 100).toFixed(2)} ${currency.toUpperCase()}`
  const endsAtFmt = endsAt.toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  // Defesa contra header injection: remove CR/LF do subject (breedName vem
  // da BD mas e' input do utilizador, e nodemailer normaliza menos rigoroso).
  const cleanBreedName = breedName.replace(/[\r\n]+/g, ' ').trim()
  const cleanBreederName = breederName.replace(/[\r\n]+/g, ' ').trim()
  const subject = `Destaque activado — ${cleanBreedName} | Patacerta`
  const text = `Olá,

O seu destaque no simulador de raça foi activado.

  Criador: ${cleanBreederName}
  Raça: ${cleanBreedName}
  Activo até: ${endsAtFmt}
  Valor pago: ${formattedPrice}
${receiptUrl ? `\nRecibo: ${receiptUrl}\n` : ''}
A sua ficha aparece agora como criador recomendado para "${cleanBreedName}" no simulador da Patacerta. Pode acompanhar impressões e cliques na sua área pessoal.

Obrigado pelo apoio!
Equipa Patacerta`

  // Escape para HTML: breederName / breedName vem da BD (input do utilizador)
  // e receiptUrl vem da Stripe API (terceiro, validar scheme http(s)).
  const safeBreederName = escapeHtml(cleanBreederName)
  const safeBreedName = escapeHtml(cleanBreedName)
  const safeEndsAt = escapeHtml(endsAtFmt)
  const safePrice = escapeHtml(formattedPrice)
  const safeReceiptUrl = receiptUrl ? escapeHtmlAttr(receiptUrl) : null

  const html = baseLayout(
    subject,
    `<p>O seu destaque no simulador de raça foi <strong>activado</strong>.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Criador:</td><td style="padding:6px 0;font-weight:600">${safeBreederName}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Raça:</td><td style="padding:6px 0;font-weight:600">${safeBreedName}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Activo até:</td><td style="padding:6px 0;font-weight:600">${safeEndsAt}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Valor pago:</td><td style="padding:6px 0;font-weight:600">${safePrice}</td></tr>
     </table>
     ${
       safeReceiptUrl
         ? `<p style="margin:16px 0"><a href="${safeReceiptUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Ver recibo</a></p>`
         : ''
     }
     <p>A sua ficha aparece agora como criador recomendado para <strong>${safeBreedName}</strong> no simulador da Patacerta.</p>
     <p>Pode acompanhar impressões e cliques na sua <em>área pessoal</em>.</p>
     <p>Obrigado pelo apoio!<br>Equipa Patacerta</p>`,
  )
  await sendMail({ to, subject, html, text })
}
