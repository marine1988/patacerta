import { Resend } from 'resend'
import { maskEmail } from './redact.js'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'Patacerta <noreply@patacerta.pt>'

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
  const client = getClient()
  if (!client) {
    const env = process.env.NODE_ENV
    if (env === 'production' || env === 'stage') {
      console.error(
        `[Email] RESEND_API_KEY nao configurada em ${env}. Email para ${maskEmail(to)} (assunto: ${subject}) NAO foi enviado. Configurar RESEND_API_KEY imediatamente.`,
      )
      return
    }
    console.log(`[Email] (dev) To: ${to} | Subject: ${subject}\n${text}`)
    return
  }
  try {
    await client.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
    })
  } catch (err) {
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
  const html = baseLayout(
    subject,
    `<p>Bem-vindo à <strong>Patacerta</strong>!</p>
     <p>Para ativar a sua conta, clique no botão abaixo. O link é válido por 24 horas.</p>
     <p style="margin:24px 0">
       <a href="${verificationUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Confirmar email</a>
     </p>
     <p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço para o navegador:<br><span style="word-break:break-all">${verificationUrl}</span></p>`,
  )
  await sendMail({ to, subject, html, text })
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = 'Reposição da palavra-passe — Patacerta'
  const text = `Recebemos um pedido para repor a palavra-passe da sua conta.

Para definir uma nova palavra-passe, abra o seguinte link (válido por 1 hora):
${resetUrl}

Se não foi você, ignore este email — a sua palavra-passe permanece inalterada.`
  const html = baseLayout(
    subject,
    `<p>Recebemos um pedido para repor a palavra-passe da sua conta.</p>
     <p>Para definir uma nova palavra-passe, clique no botão abaixo. O link é válido por 1 hora.</p>
     <p style="margin:24px 0">
       <a href="${resetUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Repor palavra-passe</a>
     </p>
     <p style="font-size:13px;color:#6b7280">Se o botão não funcionar, copie este endereço para o navegador:<br><span style="word-break:break-all">${resetUrl}</span></p>
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

  const safeBreederName = cleanBreederName
  const safeBreedName = cleanBreedName
  const safeEndsAt = endsAtFmt
  const safePrice = formattedPrice
  const safeReceiptUrl = receiptUrl

  const html = baseLayout(
    subject,
    `<p>O seu destaque no simulador de raça foi <strong>activado</strong>.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse">
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Criador:</td><td style="padding:6px 0;font-weight:600">${safeBreederName}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Raça:</td><td style="padding:6px 0;font-weight:600">${safeBreedName}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Activo até:</td><td style="padding:6px 0;font-weight:600">${safeEndsAt}</td></tr>
       <tr><td style="padding:6px 12px 6px 0;color:#6b7280">Valor pago:</td><td style="padding:6px 0;font-weight:600">${safePrice}</td></tr>
     </table>
     ${safeReceiptUrl ? `<p style="margin:16px 0"><a href="${safeReceiptUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Ver recibo</a></p>` : ''}
     <p>A sua ficha aparece agora como criador recomendado para <strong>${safeBreedName}</strong> no simulador da Patacerta.</p>
     <p>Pode acompanhar impressões e cliques na sua <em>área pessoal</em>.</p>
     <p>Obrigado pelo apoio!<br>Equipa Patacerta</p>`,
  )
  await sendMail({ to, subject, html, text })
}
