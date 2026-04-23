import type { Request, Response } from 'express'
import { prisma } from '../../lib/prisma.js'
import { AppError } from '../../middleware/error-handler.js'
import { asyncHandler, parseId, getBreederForUser } from '../../lib/helpers.js'
import { uploadFile, deleteFile, getPresignedUrl } from '../../lib/minio.js'
import multer from 'multer'
import path from 'path'

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

  const docType = req.body.docType
  if (!docType || !['NIF', 'DGAV', 'CARTAO_CIDADAO', 'CITES', 'OTHER'].includes(docType)) {
    throw new AppError(400, 'Tipo de documento inválido', 'INVALID_DOC_TYPE')
  }

  const breeder = await getBreederForUser(req.user!.userId)

  // Sanitize filename: use only the extension from path.extname, stripping path traversal
  const ext =
    path
      .extname(req.file.originalname)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, '') || '.bin'
  const safeFileName = `${Date.now()}-${docType}${ext}`
  const objectName = `verification/${breeder.id}/${safeFileName}`

  const fileUrl = await uploadFile(objectName, req.file.buffer, req.file.mimetype)

  const doc = await prisma.verificationDoc.create({
    data: {
      breederId: breeder.id,
      docType,
      fileUrl,
      fileName: safeFileName, // Store sanitized name, not raw originalname
    },
    select: {
      id: true,
      docType: true,
      fileName: true,
      status: true,
      createdAt: true,
    },
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
  })
  if (!doc) throw new AppError(404, 'Documento não encontrado', 'DOC_NOT_FOUND')
  if (doc.status !== 'PENDING')
    throw new AppError(400, 'Só pode eliminar documentos pendentes', 'DOC_NOT_PENDING')

  // Delete from MinIO
  const objectName = doc.fileUrl.replace(/^\/[^/]+\//, '')
  await deleteFile(objectName).catch(() => {})

  await prisma.verificationDoc.delete({ where: { id: docId } })

  res.status(204).send()
})

// B-15 + B-16: Guard doc status and breeder suspension on review
export const reviewDocument = asyncHandler(async (req, res) => {
  const docId = parseId(req.params.docId)

  const { status, notes } = req.body
  if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
    throw new AppError(400, 'Estado inválido. Use APPROVED ou REJECTED.', 'INVALID_STATUS')
  }

  const doc = await prisma.verificationDoc.findUnique({
    where: { id: docId },
    include: { breeder: true },
  })
  if (!doc) throw new AppError(404, 'Documento não encontrado', 'DOC_NOT_FOUND')

  // B-15: Only allow reviewing PENDING documents
  if (doc.status !== 'PENDING') {
    throw new AppError(400, 'Este documento já foi revisto', 'DOC_ALREADY_REVIEWED')
  }

  const updated = await prisma.verificationDoc.update({
    where: { id: docId },
    data: {
      status,
      notes: notes || null,
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

  // If all docs approved, auto-verify breeder — but NOT if suspended (B-16)
  if (status === 'APPROVED' && doc.breeder.status !== 'SUSPENDED') {
    const allDocs = await prisma.verificationDoc.findMany({
      where: { breederId: doc.breederId },
    })
    const allApproved = allDocs.every((d) => d.status === 'APPROVED')
    if (allApproved) {
      await prisma.breeder.update({
        where: { id: doc.breederId },
        data: { status: 'VERIFIED', verifiedAt: new Date() },
      })
    }
  }

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

  // Extract object name from stored fileUrl (format: /bucket/objectName)
  const objectName = doc.fileUrl.replace(/^\/[^/]+\//, '')
  const url = await getPresignedUrl(objectName, 900) // 15 min expiry

  res.json({ url, fileName: doc.fileName, docType: doc.docType })
})
