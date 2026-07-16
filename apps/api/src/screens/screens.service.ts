import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SaveScreenDto, ScreenValueDto } from './dto/screen.dto'
import { screenBaseFlags } from './screen-policy'

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
    const isSystem = dto.isSystem ?? false
    const g = await this.pinnedFlags(organizationId, dto.subjectType, isSystem, dto.status ?? 'DRAFT', dto.isDefault ?? false)
    const screen = await this.prisma.screen.create({
      data: {
        organizationId,
        name:        dto.name,
        description: dto.description ?? null,
        subjectType: dto.subjectType,
        status:      g.status,
        isDefault:   g.isDefault,
        isSystem,
      },
    })
    await this.saveChildren(screen.id, dto)
    if (g.isDefault) await this.unsetOtherDefaults(organizationId, dto.subjectType, screen.id)
    return this.getScreen(organizationId, screen.id)
  }

  async update(organizationId: string, id: string, dto: SaveScreenDto) {
    const existing = await this.prisma.screen.findFirst({ where: { id, organizationId } })
    if (!existing) return null
    // tela do sistema é IMUTÁVEL em tipo/situação/padrão (é a base): sempre ATIVA e padrão.
    const subjectType = existing.isSystem ? existing.subjectType : dto.subjectType
    const g = await this.pinnedFlags(organizationId, subjectType, existing.isSystem, dto.status ?? existing.status, dto.isDefault ?? false, id)
    await this.prisma.screen.update({
      where: { id },
      data: {
        name:        dto.name,
        description: dto.description ?? null,
        subjectType,
        isDefault:   g.isDefault,
        isSystem:    existing.isSystem, // preserva o flag do sistema
        status:      g.status,
      },
    })
    await this.saveChildren(id, dto)
    if (g.isDefault) await this.unsetOtherDefaults(organizationId, subjectType, id)
    return this.getScreen(organizationId, id)
  }

  /**
   * Regras das telas base do sistema:
   * - `isSystem` → SEMPRE ativa e SEMPRE padrão (não pode arquivar nem deixar de ser padrão).
   * - não-sistema → não pode virar padrão quando já existe uma tela do sistema para o tipo
   *   (a padrão do tipo é a base; variações são telas não-padrão atribuídas por perfil/etapa).
   */
  private async pinnedFlags(
    organizationId: string, subjectType: string, isSystem: boolean,
    reqStatus: string, reqDefault: boolean, selfId?: string,
  ): Promise<{ status: string; isDefault: boolean }> {
    // só consulta o banco quando o pedido depende da existência da base do sistema
    const systemExistsForType = !isSystem && reqDefault
      ? Boolean(await this.prisma.screen.findFirst({
          where: { organizationId, subjectType, isSystem: true, ...(selfId ? { id: { not: selfId } } : {}) },
        }))
      : false
    return screenBaseFlags({ isSystem, systemExistsForType, reqStatus, reqDefault })
  }

  /** Garante uma única tela padrão por (org, subjectType). NUNCA desmarca a base do sistema. */
  private async unsetOtherDefaults(organizationId: string, subjectType: string, keepId: string) {
    await this.prisma.screen.updateMany({
      where: { organizationId, subjectType, isDefault: true, isSystem: false, id: { not: keepId } },
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
        hiddenCategories: (f.hiddenCategories ?? null) as never, // JSON serializado no middleware
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

  /**
   * Valores de VÁRIOS subjects numa tacada (listagem/exportação de Parceiros).
   * Retorna linhas planas {subjectId, fieldId, value}; o cliente agrupa por subjectId.
   * O índice ([organizationId, subjectType, subjectId]) cobre o `in`.
   *
   * O `in` é fatiado em blocos: o SQL Server limita a ~2100 parâmetros por consulta,
   * e a exportação chega a mandar milhares de ids — sem fatiar, uma base grande faz a
   * query estourar e as colunas custom saem vazias em silêncio.
   */
  async getValuesBatch(organizationId: string, subjectType: string, subjectIds: string[]) {
    const ids = [...new Set(subjectIds)].filter(Boolean)
    if (!ids.length) return []
    const CHUNK = 1000
    const out: { subjectId: string; fieldId: string; value: string }[] = []
    for (let i = 0; i < ids.length; i += CHUNK) {
      const rows = await this.prisma.screenFieldValue.findMany({
        where: { organizationId, subjectType, subjectId: { in: ids.slice(i, i + CHUNK) } },
      })
      for (const r of rows) out.push({ subjectId: r.subjectId, fieldId: r.fieldId, value: r.value })
    }
    return out
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
