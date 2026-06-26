import {
  Controller, Post, Get, Delete, Param, UploadedFile, UseInterceptors,
  BadRequestException, NotFoundException, ForbiddenException, StreamableFile,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger'
import { randomUUID } from 'crypto'
import { CurrentOrg } from '../auth/current-org.decorator'
import { StorageService, StoredFileMeta } from './storage.service'

/** Forma mínima do arquivo do multer (memory storage) — evita depender de @types/multer. */
interface UploadedFileLike { originalname: string; buffer: Buffer; size: number; mimetype: string }

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @ApiOperation({ summary: 'Faz upload de um arquivo (anexo)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(@UploadedFile() file: UploadedFileLike, @CurrentOrg() organizationId: string): Promise<StoredFileMeta> {
    if (!file) throw new BadRequestException('Arquivo ausente (campo "file")')
    const safeName = (file.originalname || 'arquivo').replace(/[^\w.\-]+/g, '_').slice(0, 120)
    const key = `${organizationId}__${randomUUID()}__${safeName}`
    const meta: StoredFileMeta = {
      key,
      name: file.originalname || safeName,
      size: file.size,
      mimeType: file.mimetype || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    }
    await this.storage.save(key, file.buffer, meta)
    return meta
  }

  @Get(':key')
  @ApiOperation({ summary: 'Baixa um arquivo pela key' })
  async download(@Param('key') key: string, @CurrentOrg() organizationId: string): Promise<StreamableFile> {
    this.assertOwnership(key, organizationId)
    let read: { buffer: Buffer; meta: StoredFileMeta }
    try {
      read = await this.storage.read(key)
    } catch {
      throw new NotFoundException('Arquivo não encontrado')
    }
    return new StreamableFile(read.buffer, {
      type: read.meta.mimeType,
      disposition: `attachment; filename="${encodeURIComponent(read.meta.name)}"`,
      length: read.meta.size,
    })
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Remove um arquivo pela key' })
  async remove(@Param('key') key: string, @CurrentOrg() organizationId: string): Promise<{ ok: true }> {
    this.assertOwnership(key, organizationId)
    await this.storage.delete(key)
    return { ok: true }
  }

  /** Isolamento multitenant + barreira contra path traversal. */
  private assertOwnership(key: string, organizationId: string): void {
    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new ForbiddenException('Key inválida')
    }
    if (!key.startsWith(`${organizationId}__`)) {
      throw new ForbiddenException('Arquivo de outra organização')
    }
  }
}
