// ============================================
// PataCerta — File magic-bytes validator
// ============================================
//
// Multer's fileFilter only checks the client-supplied Content-Type / extension.
// Both can be trivially spoofed: a malicious actor can rename `evil.exe` to
// `cute.png`, set `Content-Type: image/png`, and bypass the allow-list. The
// real defence is to inspect the leading bytes of the buffer ("magic numbers")
// against the format we claim to accept.
//
// We support exactly the formats accepted across the API:
//   - JPEG (FF D8 FF)
//   - PNG  (89 50 4E 47 0D 0A 1A 0A)
//   - WebP (RIFF .... WEBP)
//   - PDF  (25 50 44 46 2D, i.e. "%PDF-")
//
// This is intentionally a small allow-list; we do not pull `file-type` because
// it is ESM-only with a heavy detection table we do not need.

import { AppError } from '../middleware/error-handler.js'

export type AllowedFileKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

function matchesJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

function matchesPng(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
}

function matchesWebp(buf: Buffer): boolean {
  // "RIFF" .... "WEBP"
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
}

function matchesPdf(buf: Buffer): boolean {
  // "%PDF-"
  return buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-'
}

/**
 * Detect the real format of `buf` from its magic bytes. Returns null if it does
 * not match any of the formats we accept.
 */
export function detectAllowedFileKind(buf: Buffer): AllowedFileKind | null {
  if (matchesJpeg(buf)) return 'image/jpeg'
  if (matchesPng(buf)) return 'image/png'
  if (matchesWebp(buf)) return 'image/webp'
  if (matchesPdf(buf)) return 'application/pdf'
  return null
}

/**
 * Throw an AppError(400) when `buf` does not match one of `allowed`. Use this
 * after multer has populated `req.file.buffer` so we validate the *actual*
 * bytes rather than the spoofable mimetype header.
 */
export function assertFileKind(buf: Buffer, allowed: readonly AllowedFileKind[]): AllowedFileKind {
  const detected = detectAllowedFileKind(buf)
  if (!detected || !allowed.includes(detected)) {
    throw new AppError(
      400,
      'Conteúdo do ficheiro não corresponde ao tipo declarado',
      'INVALID_FILE_CONTENT',
    )
  }
  return detected
}
