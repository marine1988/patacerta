import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, getBreederForUser } from '../../lib/helpers.js'
import {
  uploadPrivateFile,
  deletePrivateFile,
  getPrivatePresignedUrl,
  deleteFile as deletePublicFile,
  getPresignedUrl as getPublicPresignedUrl,
  streamObject,
} from '../../lib/minio.js'
import { assertFileKind } from '../../lib/file-validation.js'
import { logAudit } from '../../lib/audit.js'
import { Prisma } from '@prisma/client'

/**
 * Documentos antigos foram guardados no bucket publico no formato
 * `/{bucket}/{objectName}`. Os novos vao para o bucket privado com
 * formato `private:{bucket}/{objectName}`. Este helper devolve a accao
 * correcta para qualquer um dos dois.
 */
function resolveDocStorage(fileUrl: string): { isPrivate: boolean; objectName: string } {
  if (fileUrl.startsWith('private:')) {
    const rest = fileUrl.slice('private:'.length) // {bucket}/{object}
    const objectName = rest.replace(/^[^/]+\//, '')
    return { isPrivate: true, objectName }
  }
  // Formato legacy: /{bucket}/{object}
  return { isPrivate: false, objectName: fileUrl.replace(/^\/[^/]+\//, '') }
}
import multer from 'multer'
import path from 'path'
import type { ReviewVerificationDocInput } from '@patacerta/shared'

// MIME types seguros para servir inline no browser. Qualquer outro
// Content-Type (legacy uploads, ficheiros corrompidos, MinIO metadata
// nao-fiavel) e' servido como application/octet-stream com Content-
// Disposition attachment para evitar XSS via ficheiros antigos cujo
// MIME armazenado seja text/html ou similar.
const SAFE_INLINE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

/**
 * Garante que a string e' segura para uso em headers HTTP. Remove
 * caracteres de controlo e aspas, e cai num placeholder se o resultado
 * ficar vazio. Defesa-em-profundidade contra header-injection caso o
 * fileName venha de um pipeline futuro que aceite originalname.
 */
function safeHeaderFileName(name: string): string {
  const stripped = name.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '')
  return stripped.length > 0 ? stripped : 'documento.bin'
}

/**
 * Trunca notes para audit log. As notas completas ficam em
 * verificationDoc.notes (consultaveis via /:docId/file ou admin UI),
 * pelo que duplicar 2000 chars no audit log (PII potencial, retencao
 * RGPD) e' desnecessario.
 */
function truncateForAudit(text: string | null | undefined, max = 200): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// Multer config: max 5MB, images + PDF
const multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new AppError(
          400,
          'Tipo de ficheiro não suportado. Use JPG, PNG, WebP ou PDF.',
          'INVALID_FILE_TYPE',
        ) as unknown as Error,
      )
    }
  },
}).single('file')

// Promisify multer so we can use asyncHandler
function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    multerUpload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          reject(new AppError(400, 'Ficheiro excede o limite de 5MB', 'FILE_TOO_LARGE'))
        } else {
          reject(err)
        }
      } else {
        resolve()
      }
    })
  })
}

export const uploadDocument = asyncHandler(async (req, res) => {
  await runMulter(req, res)

  if (!req.file) throw new AppError(400, 'Nenhum ficheiro enviado', 'NO_FILE')

  // Defence-in-depth: re-check the buffer's magic bytes. The mimetype header
  // multer used in fileFilter is supplied by the client and is trivially
  // spoofable; this catches a renamed/repackaged executable masquerading as
  // an image or PDF. Use the SERVER-DETECTED kind as the stored Content-Type
  // so that the bucket cannot serve attacker-chosen MIMEs.
  const detectedMime = assertFileKind(req.file.buffer, [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ])

  // Apenas DGAV e suportado. Os outros tipos foram removidos do dominio.
  const docType = req.body.docType
  if (docType !== 'DGAV') {
    throw new AppError(400, 'Tipo de documento inválido', 'INVALID_DOC_TYPE')
  }

  const breeder = await getBreederForUser(req.user!.userId)

  // DGAV e o documento mais critico: so pode existir UM por criador, e
  // assim que o perfil estiver verificado fica trancado (evita reutilizar
  // o mesmo certificado em multiplos perfis ou remover apos aprovacao).
  //
  // Permitimos substituir um DGAV REJECTED (o admin rejeitou, criador
  // tem de re-submeter um novo). Sem esta excepcao, o criador ficava
  // wedged: nao podia eliminar (REJECTED) nem fazer upload (existe).
  // A linha do REJECTED e' descartada (audit log preserva o historico
  // do erro original) e substituida pela nova versao.
  if (docType === 'DGAV') {
    if (breeder.status === 'VERIFIED') {
      throw new AppError(
        403,
        'O certificado DGAV nao pode ser alterado apos verificacao do perfil. Contacte o suporte.',
        'DGAV_LOCKED',
      )
    }
    const existingDgav = await prisma.verificationDoc.findFirst({
      where: {
        breederId: breeder.id,
        docType: 'DGAV',
        status: { in: ['PENDING', 'APPROVED'] },
      },
      select: { id: true, status: true },
    })
    if (existingDgav) {
      throw new AppError(
        409,
        'Ja existe um certificado DGAV submetido. Elimine o atual antes de enviar outro.',
        'DGAV_ALREADY_EXISTS',
      )
    }
    // Limpar DGAVs REJECTED previos (best-effort no storage). O audit
    // log permanece — o registo da rejeicao fica retido para forense.
    const previouslyRejected = await prisma.verificationDoc.findMany({
      where: { breederId: breeder.id, docType: 'DGAV', status: 'REJECTED' },
      select: { id: true, fileUrl: true },
    })
    for (const old of previouslyRejected) {
      const { isPrivate, objectName } = resolveDocStorage(old.fileUrl)
      await (isPrivate
        ? deletePrivateFile(objectName)
        : deletePublicFile(objectName)
      ).catch(() => undefined)
      await prisma.verificationDoc.delete({ where: { id: old.id } }).catch(() => undefined)
    }
  }

  // Sanitize filename: use only the extension from path.extname, stripping path traversal
  const ext =
    path
      .extname(req.file.originalname)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '') || '.bin'
  const safeFileName = `${Date.now()}-${docType}${ext}`
  const objectName = `verification/${breeder.id}/${safeFileName}`

  const fileUrl = await uploadPrivateFile(objectName, req.file.buffer, detectedMime)

  // TOCTOU: dois uploads concorrentes (double-click, dois tabs) podem
  // ambos passar o existingDgav check e ambos chegar aqui. Sem indice
  // unico a nivel DB, os dois inserts succeed. Catch defensivo: se
  // outro request criou o registo entretanto, devolvemos o erro 409
  // standard (uniqueness pode ser garantido por @@unique futuro em
  // schema.prisma; entretanto basta este guard).
  let doc
  try {
    doc = await prisma.verificationDoc.create({
      data: {
        breederId: breeder.id,
        docType,
        fileUrl,
        fileName: safeFileName,
      },
      select: {
        id: true,
        docType: true,
        fileName: true,
        status: true,
        createdAt: true,
      },
    })
  } catch (err) {
    // Cleanup do ficheiro que ja foi para o MinIO: o registo na BD nao
    // existe, pelo que o ficheiro fica orfao.
    await deletePrivateFile(objectName).catch(() => undefined)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppError(
        409,
        'Ja existe um certificado DGAV submetido. Elimine o atual antes de enviar outro.',
        'DGAV_ALREADY_EXISTS',
      )
    }
    throw err
  }

  await logAudit({
    userId: req.user!.userId,
    action: 'VERIFICATION_DOC_UPLOADED',
    entity: 'VerificationDoc',
    entityId: doc.id,
    details: `${docType} uploaded for breeder ${breeder.id}`,
    ipAddress: req.ip,
  })

  res.status(201).json(doc)
})

export const getMyDocuments = asyncHandler(async (req, res) => {
  const breeder = await getBreederForUser(req.user!.userId)

  const docs = await prisma.verificationDoc.findMany({
    where: { breederId: breeder.id },
    select: {
      id: true,
      docType: true,
      fileName: true,
      status: true,
      notes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json(docs)
})

export const deleteDocument = asyncHandler(async (req, res) => {
  const docId = parseId(req.params.docId)
  const breeder = await getBreederForUser(req.user!.userId)

  const doc = await prisma.verificationDoc.findFirst({
    where: { id: docId, breederId: breeder.id },
    include: { breeder: { select: { status: true } } },
  })
  if (!doc) throw new AppError(404, 'Documento não encontrado', 'DOC_NOT_FOUND')
  // Permitir DELETE de docs PENDING ou REJECTED. APPROVED nao pode
  // ser apagado (DGAV trancado apos verificacao). Sem o REJECTED no
  // allowlist, o criador ficava wedged: nao podia eliminar o DGAV
  // rejeitado nem fazer upload de outro (uniqueness aplicava-se).
  if (doc.status !== 'PENDING' && doc.status !== 'REJECTED') {
    throw new AppError(
      400,
      'Só pode eliminar documentos pendentes ou rejeitados',
      'DOC_NOT_DELETABLE',
    )
  }

  // Defesa em profundidade: mesmo que o doc esteja PENDING, se o perfil
  // ja esta verificado o DGAV nao pode ser removido — protege contra
  // remocao apos aprovacao.
  if (doc.docType === 'DGAV' && doc.breeder.status === 'VERIFIED') {
    throw new AppError(
      403,
      'O certificado DGAV nao pode ser eliminado apos verificacao do perfil.',
      'DGAV_LOCKED',
    )
  }

  // Delete from MinIO (resolve storage backend by URL prefix)
  const { isPrivate, objectName } = resolveDocStorage(doc.fileUrl)
  await (isPrivate ? deletePrivateFile(objectName) : deletePublicFile(objectName)).catch(() => {})

  await prisma.verificationDoc.delete({ where: { id: docId } })

  await logAudit({
    userId: req.user!.userId,
    action: 'VERIFICATION_DOC_DELETED',
    entity: 'VerificationDoc',
    entityId: docId,
    details: `${doc.docType} deleted by breeder ${breeder.id}`,
    ipAddress: req.ip,
  })

  res.status(204).send()
})

// Admin pode rever um documento DGAV em qualquer altura, mesmo apos uma
// revisao previa. Cenarios:
//   - PENDING -> APPROVED/REJECTED  (revisao inicial)
//   - REJECTED -> APPROVED          (admin enganou-se a rejeitar)
//   - APPROVED -> REJECTED          (admin descobre fraude post-aprovacao)
//   - mesmo status (no-op): permitimos para simplificar a UI; backend
//     evita updates desnecessarios.
// O criador e' re-promovido/despromovido conforme o novo status do DGAV.
// Audit log distingue revisao inicial de mudanca (action sufixo _CHANGED).
export const reviewDocument = asyncHandler(async (req, res) => {
  const docId = parseId(req.params.docId)
  // Body shape is enforced by reviewVerificationDocSchema on the router; the
  // controller no longer has to maintain its own allow-list.
  const { status, notes } = req.body as ReviewVerificationDocInput

  const doc = await prisma.verificationDoc.findUnique({
    where: { id: docId },
    include: { breeder: true },
  })
  if (!doc) throw new AppError(404, 'Documento não encontrado', 'DOC_NOT_FOUND')

  const previousStatus = doc.status
  // isReReview: a revisao actual sobre-escreve uma anterior (nao
  // PENDING). Cobre tanto mudanca de veredicto (REJECTED->APPROVED)
  // como edicao de notas sobre um veredicto preexistente
  // (REJECTED->REJECTED com notas diferentes). Para esses casos o
  // audit log fica com sufixo _CHANGED.
  const isReReview = previousStatus !== 'PENDING'

  // No-op idempotente: se o admin clica Rejeitar num doc ja rejeitado
  // sem alterar notas, nao escrevemos nada (evita audit-log spam).
  if (previousStatus === status && (notes ?? null) === doc.notes) {
    res.json({
      id: doc.id,
      docType: doc.docType,
      status: doc.status,
      notes: doc.notes,
      reviewedAt: doc.reviewedAt,
    })
    return
  }

  // Transacao garante atomicidade entre verificationDoc.update e
  // breeder.update: se a 2a escrita falhar, a 1a faz rollback. Caso
  // contrario, o DGAV ficaria APPROVED mas o breeder continuaria DRAFT
  // (ou vice-versa) -- estado inconsistente em fluxo critico.
  let breederStatusChange: 'VERIFIED' | 'DRAFT' | null = null
  const updated = await prisma.$transaction(async (tx) => {
    const updatedDoc = await tx.verificationDoc.update({
      where: { id: docId },
      data: {
        status,
        // Preservar notes existentes quando o body nao as fornece. Sem
        // isto, uma aprovacao posterior (sem notes) apagava as notas
        // detalhadas da rejeicao anterior — historico perdido na linha
        // do proprio doc (audit log mantem-no, mas a UI mostra `notes`
        // do registo principal).
        notes: notes !== undefined ? notes : doc.notes,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
      },
      select: {
        id: true,
        docType: true,
        status: true,
        notes: true,
        reviewedAt: true,
      },
    })

    // O DGAV e o UNICO documento que controla a verificacao do criador.
    // Aprovar DGAV -> breeder VERIFIED. Rejeitar DGAV -> breeder DRAFT
    // (criador re-submete depois). Outros docs ja nao sao usados, mas se
    // existirem dados antigos sao revistos sem afectar status.
    // SUSPENDED nao e' tocado: suspensao e' uma decisao administrativa
    // separada que sobrepoe a verificacao.
    if (doc.docType === 'DGAV' && doc.breeder.status !== 'SUSPENDED') {
      if (status === 'APPROVED' && doc.breeder.status !== 'VERIFIED') {
        await tx.breeder.update({
          where: { id: doc.breederId },
          data: { status: 'VERIFIED', verifiedAt: new Date() },
        })
        breederStatusChange = 'VERIFIED'
      } else if (status === 'REJECTED' && doc.breeder.status === 'VERIFIED') {
        // Despromover de VERIFIED para DRAFT quando o admin reverte uma
        // aprovacao previa. Limpa verifiedAt.
        await tx.breeder.update({
          where: { id: doc.breederId },
          data: { status: 'DRAFT', verifiedAt: null },
        })
        breederStatusChange = 'DRAFT'
      } else if (status === 'REJECTED' && doc.breeder.status !== 'DRAFT') {
        // Rejeicao inicial (PENDING -> REJECTED): garantir DRAFT.
        await tx.breeder.update({
          where: { id: doc.breederId },
          data: { status: 'DRAFT', verifiedAt: null },
        })
        breederStatusChange = 'DRAFT'
      }
    }

    return updatedDoc
  })

  // Audit log distingue revisao inicial vs re-revisao (mudanca de
  // veredicto OU edicao de notas sobre veredicto preexistente). O
  // detail inclui sempre a transicao para facilitar troubleshooting.
  // Notas truncadas a 200 chars para evitar duplicar texto longo no
  // audit log (a versao completa fica em verificationDoc.notes).
  const baseAction = status === 'APPROVED' ? 'VERIFICATION_DOC_APPROVED' : 'VERIFICATION_DOC_REJECTED'
  const notesSummary = truncateForAudit(notes)
  await logAudit({
    userId: req.user!.userId,
    action: isReReview ? `${baseAction}_CHANGED` : baseAction,
    entity: 'VerificationDoc',
    entityId: docId,
    details: `${doc.docType} ${previousStatus}->${status} for breeder ${doc.breederId}${
      breederStatusChange ? ` -> breeder.status=${breederStatusChange}` : ''
    }${notesSummary ? `: ${notesSummary}` : ''}`,
    ipAddress: req.ip,
  })

  res.json(updated)
})

// View document — breeders see own docs, admins see any
export const viewDocument = asyncHandler(async (req, res) => {
  const docId = parseId(req.params.docId)
  const isAdmin = req.user!.role === 'ADMIN'

  const doc = await prisma.verificationDoc.findUnique({
    where: { id: docId },
    include: { breeder: { select: { userId: true } } },
  })
  if (!doc) throw new AppError(404, 'Documento não encontrado', 'DOC_NOT_FOUND')

  // Authorization: breeder can only view own docs
  if (!isAdmin && doc.breeder.userId !== req.user!.userId) {
    throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  }

  // Resolve storage backend and generate a short-lived presigned URL.
  // Documentos novos vao para bucket privado; legacy ficam no publico
  // (mas mesmo assim usamos presigned para uniformidade da resposta).
  const { isPrivate, objectName } = resolveDocStorage(doc.fileUrl)
  const url = isPrivate
    ? await getPrivatePresignedUrl(objectName, 900)
    : await getPublicPresignedUrl(objectName, 900)

  // Audit acesso por admin — defesa contra exfiltracao em caso de
  // sessao admin comprometida (iterar docIds 1..N). Owner views nao
  // sao auditadas (nivel de ruido demasiado alto).
  if (isAdmin) {
    await logAudit({
      userId: req.user!.userId,
      action: 'ADMIN_VIEW_VERIFICATION_DOC',
      entity: 'VerificationDoc',
      entityId: docId,
      details: `via /view (presigned) docType=${doc.docType}`,
      ipAddress: req.ip,
    })
  }

  res.json({ url, fileName: doc.fileName, docType: doc.docType })
})

// Stream document bytes — alternativa a viewDocument para ambientes em
// que o MinIO nao tem hostname publico (e portanto presigned URLs apontam
// para `minio:9000` interno e falham no browser). Aqui o API faz proxy
// dos bytes, mantendo a auth via JWT bearer (que ja vem no axios).
//
// Resposta: bytes brutos com Content-Type validado contra whitelist +
// Content-Disposition inline (ou attachment para tipos nao-seguros).
// O frontend faz `fetch -> blob -> URL.createObjectURL` e usa como src
// do <img>/PDF viewer.
export const streamDocument = asyncHandler(async (req, res) => {
  const docId = parseId(req.params.docId)
  const isAdmin = req.user!.role === 'ADMIN'

  const doc = await prisma.verificationDoc.findUnique({
    where: { id: docId },
    include: { breeder: { select: { userId: true } } },
  })
  if (!doc) throw new AppError(404, 'Documento não encontrado', 'DOC_NOT_FOUND')

  if (!isAdmin && doc.breeder.userId !== req.user!.userId) {
    throw new AppError(403, 'Sem permissão', 'FORBIDDEN')
  }

  const { isPrivate, objectName } = resolveDocStorage(doc.fileUrl)
  const { stream, contentType, contentLength } = await streamObject(
    isPrivate ? 'private' : 'public',
    objectName,
  )

  // Audit acesso por admin (ver viewDocument). Acontece antes do pipe
  // para garantir log mesmo se o stream falhar a meio.
  if (isAdmin) {
    await logAudit({
      userId: req.user!.userId,
      action: 'ADMIN_VIEW_VERIFICATION_DOC',
      entity: 'VerificationDoc',
      entityId: docId,
      details: `via /file (stream) docType=${doc.docType}`,
      ipAddress: req.ip,
    })
  }

  // Whitelist de MIMEs servidos inline. Docs legacy (bucket publico,
  // upload anterior a magic-byte validation) podem ter contentType
  // arbitrario armazenado no MinIO — incluindo text/html (potencial
  // stored XSS via inline render). Para qualquer MIME fora da
  // whitelist forcamos attachment + octet-stream.
  const safeMime = SAFE_INLINE_MIMES.has(contentType.toLowerCase())
    ? contentType
    : 'application/octet-stream'
  const disposition = safeMime === 'application/octet-stream' ? 'attachment' : 'inline'
  const safeName = safeHeaderFileName(doc.fileName)

  res.setHeader('Content-Type', safeMime)
  res.setHeader('Content-Length', contentLength)
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`)
  // Defesa adicional: nosniff impede o browser de re-interpretar o
  // body como text/html mesmo que conseguissemos enganar o
  // Content-Type. no-store: documento sensivel (PII oficial),
  // browser nao deve cachear (compartilhamento de PC, OS users).
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'no-store')

  stream.pipe(res)
  stream.on('error', (err) => {
    // Se o stream falhar a meio, ja enviamos headers — apenas destruir
    // a resposta para o browser saber que algo correu mal.
    console.error('[streamDocument] stream error', err)
    res.destroy(err)
  })
})
