import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'
import { R2Driver } from './r2.driver'

export interface StoredFileMeta {
  key: string
  name: string
  size: number
  mimeType: string
  uploadedAt: string
}

/** Um objeto existente no storage. `lastModified` (quando o driver sabe) alimenta a janela
 *  de graça da varredura de órfãos: um blob recém-enviado cujo contrato ainda não foi salvo
 *  não pode ser reapado, senão a limpeza vira perda de arquivo. */
export interface StoredObject {
  key: string
  lastModified?: Date
}

/** Contrato comum a todos os backends de armazenamento de anexos. */
export interface StorageDriver {
  save(key: string, buffer: Buffer, meta: StoredFileMeta): Promise<void>
  read(key: string): Promise<{ buffer: Buffer; meta: StoredFileMeta }>
  delete(key: string): Promise<void>
  /** Lista TODAS as keys do storage — base da varredura de órfãos. */
  list(): Promise<StoredObject[]>
}

/**
 * Driver de **disco local** — grava o arquivo + um sidecar `<key>.meta.json` com
 * nome/tamanho/mime originais. Pasta em STORAGE_DIR (default `./uploads`).
 * Ideal para on-premise (dados na infra do cliente) ou dev.
 */
export class LocalDiskDriver implements StorageDriver {
  private readonly dir = path.resolve(process.env.STORAGE_DIR || 'uploads')

  private filePath(key: string) { return path.join(this.dir, key) }
  private metaPath(key: string) { return path.join(this.dir, `${key}.meta.json`) }

  async save(key: string, buffer: Buffer, meta: StoredFileMeta): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.filePath(key), buffer)
    await fs.writeFile(this.metaPath(key), JSON.stringify(meta), 'utf8')
  }

  async read(key: string): Promise<{ buffer: Buffer; meta: StoredFileMeta }> {
    const [buffer, metaRaw] = await Promise.all([
      fs.readFile(this.filePath(key)),
      fs.readFile(this.metaPath(key), 'utf8'),
    ])
    return { buffer, meta: JSON.parse(metaRaw) as StoredFileMeta }
  }

  async delete(key: string): Promise<void> {
    await Promise.allSettled([
      fs.rm(this.filePath(key), { force: true }),
      fs.rm(this.metaPath(key), { force: true }),
    ])
  }

  async list(): Promise<StoredObject[]> {
    let names: string[]
    try { names = await fs.readdir(this.dir) }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
    const out: StoredObject[] = []
    for (const name of names) {
      if (name.endsWith('.meta.json')) continue // sidecar de metadado, não é um blob próprio
      let lastModified: Date | undefined
      try { lastModified = (await fs.stat(path.join(this.dir, name))).mtime } catch { /* idade desconhecida */ }
      out.push({ key: name, lastModified })
    }
    return out
  }
}

/**
 * Armazenamento de anexos. Escolhe o driver por `STORAGE_DRIVER`:
 *   - `local` (default) → disco local (on-premise / dev)
 *   - `r2` | `s3`       → Cloudflare R2 / S3 (SaaS em nuvem)
 *
 * Controllers e UI trabalham só com `key` + `StoredFileMeta`, então trocar de
 * driver é só mudar a env — nada mais muda.
 */
@Injectable()
export class StorageService implements StorageDriver {
  private readonly driver: StorageDriver

  constructor() {
    const kind = (process.env.STORAGE_DRIVER || 'local').toLowerCase()
    this.driver = kind === 'r2' || kind === 's3' ? new R2Driver() : new LocalDiskDriver()
    new Logger('StorageService').log(`Driver de anexos: ${kind}`)
  }

  save(key: string, buffer: Buffer, meta: StoredFileMeta) { return this.driver.save(key, buffer, meta) }
  read(key: string) { return this.driver.read(key) }
  delete(key: string) { return this.driver.delete(key) }
  list() { return this.driver.list() }
}
