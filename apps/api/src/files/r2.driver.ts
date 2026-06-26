import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import type { StorageDriver, StoredFileMeta } from './storage.service'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`STORAGE_DRIVER=r2 exige a variável de ambiente ${name}`)
  return v
}

/**
 * Driver de **Cloudflare R2 / S3** (API S3-compatível). Ativado com
 * `STORAGE_DRIVER=r2`. Guarda o arquivo com ContentType + metadata (nome/tamanho/
 * data) no próprio objeto — sem sidecar. Lê as credenciais do ambiente:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *   (opcional R2_ENDPOINT para S3/MinIO genérico).
 *
 * Fica inerte enquanto STORAGE_DRIVER=local — só é instanciado quando selecionado,
 * então a ausência das credenciais não afeta o uso on-premise/dev.
 */
export class R2Driver implements StorageDriver {
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    const accountId = required('R2_ACCOUNT_ID')
    this.bucket = required('R2_BUCKET')
    this.client = new S3Client({
      region: process.env.R2_REGION || 'auto',
      endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      },
    })
  }

  async save(key: string, buffer: Buffer, meta: StoredFileMeta): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: meta.mimeType,
      // metadata S3 deve ser ASCII → o nome (pode ter acentos) vai url-encoded.
      Metadata: { name: encodeURIComponent(meta.name), size: String(meta.size), uploadedat: meta.uploadedAt },
    }))
  }

  async read(key: string): Promise<{ buffer: Buffer; meta: StoredFileMeta }> {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    const buffer = Buffer.from(await out.Body!.transformToByteArray())
    const m = out.Metadata || {}
    const meta: StoredFileMeta = {
      key,
      name: m.name ? decodeURIComponent(m.name) : key,
      size: out.ContentLength ?? buffer.length,
      mimeType: out.ContentType || 'application/octet-stream',
      uploadedAt: m.uploadedat || new Date(0).toISOString(),
    }
    return { buffer, meta }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}
