import { Client } from 'minio'

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
})

const PUBLIC_BUCKET = process.env.MINIO_BUCKET || 'patacerta-uploads'
// Bucket privado para documentos de verificacao (DGAV) e outros artefactos
// que nao devem ser publicamente acessiveis. Servidos sempre via presigned
// URL com TTL curto. NAO partilha politica com o bucket publico.
const PRIVATE_BUCKET = process.env.MINIO_PRIVATE_BUCKET || 'patacerta-private'

// Re-export para compatibilidade com codigo existente
export const BUCKET = PUBLIC_BUCKET
export { PRIVATE_BUCKET }

/**
 * Bucket policy that allows anonymous read of all objects. Necessary
 * because the public URL scheme used by `uploadFile` is
 * `/${BUCKET}/${objectName}` and the frontend nginx proxies that path
 * straight to MinIO without signing requests.
 *
 * Without this policy, browser GETs for photos return 403/AccessDenied.
 */
function publicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  })
}

/** Ensure both buckets exist on startup and have correct policies. */
export async function ensureBucket(): Promise<void> {
  // Public bucket — fotos de criadores, servicos, etc.
  const publicExists = await minioClient.bucketExists(PUBLIC_BUCKET)
  if (!publicExists) {
    await minioClient.makeBucket(PUBLIC_BUCKET)
    console.log(`[MinIO] Created public bucket: ${PUBLIC_BUCKET}`)
  }
  try {
    await minioClient.setBucketPolicy(PUBLIC_BUCKET, publicReadPolicy(PUBLIC_BUCKET))
    console.log(`[MinIO] Public-read policy applied to: ${PUBLIC_BUCKET}`)
  } catch (err) {
    console.warn(`[MinIO] Failed to set bucket policy on ${PUBLIC_BUCKET}:`, err)
  }

  // Private bucket — DGAV e outros docs de verificacao. NAO recebe policy
  // publica; acesso e exclusivamente via presigned URL gerada server-side.
  const privateExists = await minioClient.bucketExists(PRIVATE_BUCKET)
  if (!privateExists) {
    await minioClient.makeBucket(PRIVATE_BUCKET)
    console.log(`[MinIO] Created private bucket: ${PRIVATE_BUCKET}`)
  }
  // Defesa em profundidade: se algum dia a politica publica tiver sido
  // aplicada por engano a este bucket, removemo-la no arranque.
  try {
    await minioClient.setBucketPolicy(PRIVATE_BUCKET, '')
  } catch {
    // setBucketPolicy('') pode nao ser suportado em todas as versoes;
    // ignorar se falhar — a politica default ja e privada.
  }
}

/** Upload a file to the public bucket and return its public URL path. */
export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await minioClient.putObject(PUBLIC_BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  })
  return `/${PUBLIC_BUCKET}/${objectName}`
}

/**
 * Upload a file to the PRIVATE bucket. Devolve um identificador opaco
 * `private:{bucket}/{objectName}` que NUNCA deve ser servido directamente
 * ao cliente — apenas usado server-side para gerar presigned URLs.
 */
export async function uploadPrivateFile(
  objectName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await minioClient.putObject(PRIVATE_BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  })
  return `private:${PRIVATE_BUCKET}/${objectName}`
}

/** Generate a presigned GET URL for a public bucket object. */
export async function getPresignedUrl(objectName: string, expirySeconds = 3600): Promise<string> {
  return minioClient.presignedGetObject(PUBLIC_BUCKET, objectName, expirySeconds)
}

/**
 * Generate a presigned GET URL for a PRIVATE bucket object. Apenas via
 * este metodo se acede a documentos de verificacao.
 */
export async function getPrivatePresignedUrl(
  objectName: string,
  expirySeconds = 900,
): Promise<string> {
  return minioClient.presignedGetObject(PRIVATE_BUCKET, objectName, expirySeconds)
}

/** Delete a file from the public bucket. */
export async function deleteFile(objectName: string): Promise<void> {
  await minioClient.removeObject(PUBLIC_BUCKET, objectName)
}

/** Delete a file from the private bucket. */
export async function deletePrivateFile(objectName: string): Promise<void> {
  await minioClient.removeObject(PRIVATE_BUCKET, objectName)
}
