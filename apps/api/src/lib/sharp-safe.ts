// ============================================
// PataCerta — sharp pipeline helpers
// ============================================
//
// Defesa contra "decompression bombs": uma imagem de 2MB no buffer pode
// descomprimir para 50000x50000 pixels (giga-bytes de RAM no sharp).
// `limitInputPixels` (default ~268M pixels) e' generoso demais para o
// nosso uso real (avatares 512px, fotos publicas 1600px) — bombs reais
// ficam em 0.5–2GB de allocacao, suficiente para derrubar o processo.
//
// Aplicamos um cap explicito antes de qualquer transformacao. Imagens
// reais de produtos/avatares ficam bem abaixo de 50M pixels (uma foto
// 6000×4000 = 24M pixels).

import sharp, { type Sharp } from 'sharp'
import { AppError } from '../middleware/error-handler.js'

const MAX_INPUT_PIXELS = 50_000_000 // 50 megapixels

/**
 * Cria um pipeline sharp seguro a partir de um buffer. Verifica
 * dimensoes antes de qualquer operacao para falhar rapido com 400 em
 * vez de OOM no worker.
 */
export async function createSafeSharp(buffer: Buffer): Promise<Sharp> {
  // `limitInputPixels` no construtor faz o sharp rejeitar metadados >
  // limite, mas a mensagem de erro e' pouco util. Lemos a metadata
  // primeiro com cap conservador, e o caller continua o pipeline.
  const probe = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
  let meta
  try {
    meta = await probe.metadata()
  } catch {
    throw new AppError(400, 'Imagem inválida ou corrompida', 'INVALID_IMAGE')
  }
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w <= 0 || h <= 0) {
    throw new AppError(400, 'Imagem inválida ou corrompida', 'INVALID_IMAGE')
  }
  if (w * h > MAX_INPUT_PIXELS) {
    throw new AppError(
      400,
      'Imagem demasiado grande (máximo 50 megapíxeis após descompressão)',
      'IMAGE_TOO_LARGE',
    )
  }
  // Devolvemos um sharp novo (probe.metadata() pode consumir o stream
  // interno) com o mesmo limite.
  return sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
}
