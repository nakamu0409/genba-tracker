import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { useRuntimeConfig } from '#imports'

/**
Cloudflare R2（S3互換API）のクライアントを作る。未設定の場合はnullを返す
 */
function getR2Client() {
  const config = useRuntimeConfig()
  const { accountId, accessKeyId, secretAccessKey } = config.r2

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  })
}

/**
画像をR2にアップロードし、公開URLを返す。R2が未設定の場合はエラーにする
 */
export async function uploadGenbaPhoto(buffer: Buffer, contentType: string, keyPrefix = 'genba-idols'): Promise<string> {
  const config = useRuntimeConfig()
  const client = getR2Client()

  if (!client || !config.r2.bucket || !config.r2.publicUrlBase) {
    throw createError({
      statusCode: 500,
      message: '画像保存先（Cloudflare R2）が設定されていません'
    })
  }

  const extension = contentType.split('/')[1] || 'jpg'
  const key = `${keyPrefix}/${randomUUID()}.${extension}`

  await client.send(new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType
  }))

  return `${config.r2.publicUrlBase.replace(/\/$/, '')}/${key}`
}

/**
R2上の画像を削除する。失敗してもアプリの動作は止めない（既に消えている等は無視する）
 */
export async function deleteGenbaPhoto(photoUrl: string): Promise<void> {
  const config = useRuntimeConfig()
  const client = getR2Client()

  if (!client || !config.r2.bucket || !config.r2.publicUrlBase) {
    return
  }

  const prefix = `${config.r2.publicUrlBase.replace(/\/$/, '')}/`
  if (!photoUrl.startsWith(prefix)) {
    return
  }

  const key = photoUrl.slice(prefix.length)

  try {
    await client.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }))
  } catch {
    // 削除失敗は無視する（孤立ファイルが残るだけで実害は小さい）
  }
}
