import { Client } from 'minio'

export const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
})

const BUCKET = process.env.MINIO_BUCKET || 'patacerta-uploads'

/** Ensure the bucket exists on startup */
export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET)
  if (!exists) {
    await minioClient.makeBucket(BUCKET)
    console.log(`[MinIO] Created bucket: ${BUCKET}`)
  }
}

/** Upload a file and return its public URL path */
export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, {
    'Content-Type': contentType,
  })
  return `/${BUCKET}/${objectName}`
}

/** Generate a presigned GET URL (for private docs) */
export async function getPresignedUrl(objectName: string, expirySeconds = 3600): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, objectName, expirySeconds)
}

/** Delete a file */
export async function deleteFile(objectName: string): Promise<void> {
  await minioClient.removeObject(BUCKET, objectName)
}
