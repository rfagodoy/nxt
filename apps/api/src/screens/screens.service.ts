import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SaveScreenDto, ScreenValueDto } from './dto/screen.dto'

/**
 * Personalização de telas (Screens). Definições (Screen/Section/Field) e valores
 * preenchidos (ScreenFieldValue, polimórfico por subject) — ver schema.prisma.
 * Escopo atual: organização (o override por perfil entra quando a entidade Perfil
 * existir; o campo ScreenField.mode já prevê ver/editar por perfil).
 */
@Injectable()
export class ScreensService {
  constructor(private readonly prisma: PrismaService) {}

  /* ─── definições ─── */

  listScreens(organizationId: string, subjectType?: string) {
    return this.prisma.screen.findMany({
      where: { organizationId, ...(subjectType ? { subjectType } : {}) },
      orderBy: { name: 'asc' },
      include: {
        sections: { orderBy: { order: 'asc' } },
        fields:   { orderBy: { order: 'asc' } },
      },
    })
  }

  getScreen(organizationId: string, id: string) {
    return this.prisma.screen.findFirst({
      where: { id, organizationId },
      include: {
        sections: { orderBy: { order: 'asc' } },
        fields:   { orderBy: { order: 'asc' } },
      },
    })
  }

  async create(organizationId: string, dto: SaveScreenDto) {
    const screen = await this.prisma.screen.create({
      data: {
        organizationId,
        name:        dto.name,
        description: dto.description ?? null,
        subjectType: dto.subjectType,
        status:      dto.status ?? 'DRAFT',
        isDefault:   dto.isDefault ?? false,
        isSystem:    dto.isSystem ?? false,
      },
    })
    await this.saveChildren(screen.id, dto)
    if (dto.isDefault) await this.unsetOtherDefaults(organizationId, dto.subjectType, screen.id)
    return this.getScreen(organizationId, screen.id)
  }

  async update(organizationId: string, id: string, dto: SaveScreenDto) {
    const existing = await this.prisma.screen.findFirst({ where: { id, organizationId } })
    if (!existing) return null
    await this.prisma.screen.update({
      where: { id },
      data: {
        name:        dto.name,
        description: dto.description ?? null,
        subjectType: dto.subjectType,
        isDefault:   dto.isDefault ?? false,
        isSystem:    dto.isSystem ?? existing.isSystem, // preserva o flag do sistema
        ...(dto.status ? { status: dto.status } : {}),
      },
    })
    await this.saveChildren(id, dto)
    if (dto.isDefault) await this.unsetOtherDefaults(organizationId, dto.subjectType, id)
    return this.getScreen(organizationId, id)
  }

  /** Garante uma única tela padrão por (org, subjectType). */
  private async unsetOtherDefaults(organizationId: string, subjectType: string, keepId: string) {
    await this.prisma.screen.updateMany({
      where: { organizationId, subjectType, isDefault: true, id: { not: keepId } },
      data:  { isDefault: false },
    })
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.prisma.screen.findFirst({ where: { id, organizationId } })
    if (!existing) return null
    if (existing.isSystem) return { id, blocked: true } // tela do sistema não é deletável
    // Cascade apaga seções/campos; os VALORES já preenchidos permanecem de propósito
    // (têm snapshot de nome/rótulo) para não sumir do histórico/exportação.
    await this.prisma.screen.delete({ where: { id } })
    return { id }
  }

  /** Upsert por id (preserva ids de campo → mantém o vínculo com os valores) e poda os removidos. */
  private async saveChildren(screenId: string, dto: SaveScreenDto) {
    const sectionIds = dto.sections.map(s => s.id)
    await this.prisma.screenSection.deleteMany({
      where: { screenId, id: { notIn: sectionIds.length ? sectionIds : ['__none__'] } },
    })
    for (const s of dto.sections) {
      const data = {
        label: s.label, name: s.name, order: s.order, defaultOpen: s.defaultOpen,
        source: s.source ?? 'CUSTOM', nativeKey: s.nativeKey ?? null, visible: s.visible ?? true,
      }
      await this.prisma.screenSection.upsert({
        where:  { id: s.id },
        create: { id: s.id, screenId, ...data },
        update: data,
      })
    }

    const fieldIds = dto.fields.map(f => f.id)
    await this.prisma.screenField.deleteMany({
      where: { screenId, id: { notIn: fieldIds.length ? fieldIds : ['__none__'] } },
    })
    for (const f of dto.fields) {
      const data = {
        sectionId:   f.sectionId ?? null,
        name:        f.name,
        label:       f.label,
        type:        f.type,
        source:      f.source,
        nativeKey:   f.nativeKey ?? null,
        mode:        f.mode,
        visible:     f.visible ?? true,
        required:    f.required,
        placeholder: f.placeholder ?? null,
        options:     (f.options ?? null) as never,      // JSON serializado no middleware
        validation:  (f.validation ?? null) as never,   // JSON serializado no middleware
        order:       f.order,
      }
      await this.prisma.screenField.upsert({
        where:  { id: f.id },
        create: { id: f.id, screenId, ...data },
        update: data,
      })
    }
  }

  /* ─── valores preenchidos ─── */

  async getValues(organizationId: string, subjectType: string, subjectId: string) {
    const rows = await this.prisma.screenFieldValue.findMany({
      where: { organizationId, subjectType, subjectId },
    })
    return rows.map(r => ({ fieldId: r.fieldId, value: r.value }))
  }

  async putValues(organizationId: string, subjectType: string, subjectId: string, values: ScreenValueDto[]) {
    const ids = values.map(v => v.fieldId)
    const fields = await this.prisma.screenField.findMany({
      where: { id: { in: ids.length ? ids : ['__none__'] } },
    })
    const byId = new Map(fields.map(f => [f.id, f]))

    for (const v of values) {
      const f = byId.get(v.fieldId)
      if (!f) continue // campo desconhecido/de outra org → ignora
      // Valor vazio = apaga a linha (mantém a tabela enxuta).
      if (v.value === '' || v.value == null) {
        await this.prisma.screenFieldValue.deleteMany({ where: { subjectType, subjectId, fieldId: v.fieldId } })
        continue
      }
      await this.prisma.screenFieldValue.upsert({
        where:  { subjectType_subjectId_fieldId: { subjectType, subjectId, fieldId: v.fieldId } },
        create: {
          organizationId, fieldId: v.fieldId, subjectType, subjectId, value: v.value,
          fieldNameSnapshot: f.name, fieldLabelSnapshot: f.label,
        },
        update: { value: v.value, fieldNameSnapshot: f.name, fieldLabelSnapshot: f.label },
      })
    }
    return this.getValues(organizationId, subjectType, subjectId)
  }
}
