import { escapeHtml as escapeHtmlImpl } from './email.js'

export function escapeHtml(value: unknown): string {
  return escapeHtmlImpl(value)
}

export { escapeHtmlImpl as escapeHtmlFromEmail }
