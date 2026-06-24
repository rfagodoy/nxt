import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string, key: string, userId = '') {
    const row = await this.prisma.appSetting.findUnique({
      where: { organizationId_userId_key: { organizationId, userId, key } },
    })
    return { key, value: row ? row.value : null }
  }

  async getMany(organizationId: string, keys: string[], userId = '') {
    const map: Record<string, unknown> = {}
    for (const k of keys) map[k] = null
    if (keys.length === 0) return map
    const rows = await this.prisma.appSetting.findMany({
      where: { organizationId, userId, key: { in: keys } },
    })
    for (const r of rows) map[r.key] = r.value
    return map
  }

  async put(organizationId: string, key: string, value: unknown, userId = '') {
    await this.prisma.appSetting.upsert({
      where:  { organizationId_userId_key: { organizationId, userId, key } },
      create: { organizationId, userId, key, value: value as never },
      update: { value: value as never },
    })
    return { key, value }
  }
}
