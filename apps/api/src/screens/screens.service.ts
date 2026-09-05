import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { SaveScreenDto, ScreenValueDto } from './dto/screen.dto'
import { screenBaseFlags, nomeDaCopia } from './screen-policy'
import { diffCustom, type CampoCustom, type OpcaoCampo } from './custom-audit'
import { chaveDoCampo, chaveDaSecao, catalogoCanonico, chavesRemovidas } from './custom-catalog'

/**
 * Personalização de telas (Screens). Definições (Screen/Section/Field) e valores
 * preenchidos (ScreenFieldValue, polimórfico por subject) — ver schema.prisma.
 * Escopo atual: organização (o override por perfil entra quando a entidade Perfil
 * existir; o campo ScreenField.mode já prevê ver/editar por perfil).
 */
@Injectable()
export class ScreensService {
  private readonly logger = new Logger('Screens')

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
        readOnly:    dto.readOnly ?? false,
      },
    })
    await this.saveChildren(screen.id, dto, organizationId, dto.subjectType)
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
        readOnly:    dto.readOnly ?? false,
      },
    })
    await this.saveChildren(id, dto, organizationId, subjectType)
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

  /**
   * DUPLICA uma tela.
   *
   * A regra é copiar a LINHA e referenciar o CAMPO: cada seção/campo vira uma linha nova
   * com a MESMA chave (`sectionKey` / `fieldKey`). Chave nova criaria um segundo campo no
   * tipo — uma coluna paralela e vazia, com o dado do contrato preso na tela antiga.
   *
   * Valor não se copia: ele é do contrato, não da tela. A cópia já enxerga o que existe.
   * A cópia nasce RASCUNHO, não padrão e nunca do sistema — duplicar não põe tela no ar.
   */
  async duplicate(organizationId: string, id: string, nome?: string) {
    const origem = await this.prisma.screen.findFirst({
      where:   { id, organizationId },
      include: { sections: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } } },
    })
    if (!origem) return null

    const usados = (await this.prisma.screen.findMany({
      where: { organizationId, subjectType: origem.subjectType }, select: { name: true },
    })).map(x => x.name)

    const nova = await this.prisma.screen.create({
      data: {
        organizationId,
        name:        nome?.trim() || nomeDaCopia(origem.name, usados),
        description: origem.description,
        subjectType: origem.subjectType,
        status:      'DRAFT',
        isDefault:   false,
        isSystem:    false,
        readOnly:    origem.readOnly,
      },
    })

    const secIdPorChave = new Map<string, string>()
    for (const sec of origem.sections) {
      const sectionKey = chaveDaSecao(sec)
      const row = await this.prisma.screenSection.create({
        data: {
          screenId: nova.id, sectionKey,
          label: sec.label, name: sec.name, source: sec.source, nativeKey: sec.nativeKey,
          visible: sec.visible, locked: sec.locked, order: sec.order, defaultOpen: sec.defaultOpen,
        },
      })
      secIdPorChave.set(sectionKey, row.id)
    }

    const chavePorIdOrigem = new Map(origem.sections.map(sec => [sec.id, chaveDaSecao(sec)]))
    for (const f of origem.fields) {
      const kSec = chavePorIdOrigem.get(f.sectionId ?? '')
      await this.prisma.screenField.create({
        data: {
          screenId:  nova.id,
          fieldKey:  chaveDoCampo(f),
          sectionId: (kSec ? secIdPorChave.get(kSec) : undefined) ?? f.sectionId,
          name: f.name, label: f.label, type: f.type, source: f.source, nativeKey: f.nativeKey,
          mode: f.mode, locked: f.locked, visible: f.visible, required: f.required,
          placeholder: f.placeholder,
          options:            f.options as never,
          validation:         f.validation as never,
          hiddenCategories:   f.hiddenCategories as never,
          requiredCategories: f.requiredCategories as never,
          order: f.order,
        },
      })
    }

    await this.propagarCamposDoTipo(organizationId, origem.subjectType)
    return this.getScreen(organizationId, nova.id)
  }

  /**
   * Grava seções e campos da tela.
   *
   * A identidade aqui é o par (TELA, CHAVE) — nunca o id sozinho. O construtor gera ids
   * DETERMINÍSTICOS por tipo (`nsec_<subject>_<chave>` e `nfld_<subject>_<chave>`, ver
   * buildNativeSeed), iguais em TODAS as telas do subject: gravando por id, a segunda tela
   * caía no ramo `update` e sobrescrevia a linha da primeira — esconder ou travar um campo
   * numa tela mexia na outra, e a tela personalizada ficava sem linha nenhuma no banco.
   *
   * O `id` continua sendo o da LINHA, e é preservado quando ainda está livre: assim a tela
   * que já era dona mantém os ids que tinha, e só a outra recebe ids novos.
   */
  private async saveChildren(screenId: string, dto: SaveScreenDto, organizationId: string, subjectType: string) {
    /* ─── seções ─── */
    const secKeys = dto.sections.map(chaveDaSecao)
    await this.prisma.screenSection.deleteMany({
      where: { screenId, sectionKey: { notIn: secKeys.length ? secKeys : ['__none__'] } },
    })
    const secOcupados = new Set((await this.prisma.screenSection.findMany({
      where:  { id: { in: dto.sections.length ? dto.sections.map(x => x.id) : ['__none__'] }, screenId: { not: screenId } },
      select: { id: true },
    })).map(r => r.id))

    const secIdPorChave = new Map<string, string>()
    for (const sec of dto.sections) {
      const sectionKey = chaveDaSecao(sec)
      const data = {
        label: sec.label, name: sec.name, order: sec.order, defaultOpen: sec.defaultOpen,
        source: sec.source ?? 'CUSTOM', nativeKey: sec.nativeKey ?? null, visible: sec.visible ?? true,
        locked: sec.locked ?? false,
      }
      const row = await this.prisma.screenSection.upsert({
        where:  { screenId_sectionKey: { screenId, sectionKey } },
        create: { ...(secOcupados.has(sec.id) ? {} : { id: sec.id }), screenId, sectionKey, ...data },
        update: data,
      })
      secIdPorChave.set(sectionKey, row.id)
    }

    /* O campo chega apontando para o id que o CLIENTE conhece (o determinístico). Traduz
       para a linha DESTA tela. Seção não enviada fica como veio — órfão some da tela, e
       perder o campo de vista é pior que guardar um id que ninguém usa. */
    const chavePorIdEnviado = new Map(dto.sections.map(sec => [sec.id, chaveDaSecao(sec)]))
    const secaoDestaTela = (sid?: string | null): string | null => {
      if (!sid) return null
      const k = chavePorIdEnviado.get(sid)
      return (k ? secIdPorChave.get(k) : undefined) ?? sid
    }

    /* ─── campos ─── */
    /* Quais campos personalizados ESTAVAM nesta tela. Um campo que some do payload sai
       do TIPO inteiro, não só desta tela: com a coluna "Aparece" fazendo o papel de
       "não quero aqui", o lixo só pode significar excluir o campo do Contrato. */
    const customAntes = await this.prisma.screenField.findMany({
      where:  { screenId, source: 'CUSTOM' },
      select: { id: true, fieldKey: true },
    })

    const fldKeys = dto.fields.map(chaveDoCampo)
    await this.prisma.screenField.deleteMany({
      where: { screenId, fieldKey: { notIn: fldKeys.length ? fldKeys : ['__none__'] } },
    })
    const fldOcupados = new Set((await this.prisma.screenField.findMany({
      where:  { id: { in: dto.fields.length ? dto.fields.map(x => x.id) : ['__none__'] }, screenId: { not: screenId } },
      select: { id: true },
    })).map(r => r.id))

    for (const f of dto.fields) {
      const fieldKey = chaveDoCampo(f)
      const data = {
        sectionId:   secaoDestaTela(f.sectionId),
        name:        f.name,
        label:       f.label,
        type:        f.type,
        source:      f.source,
        nativeKey:   f.nativeKey ?? null,
        mode:        f.mode,
        locked:      f.locked ?? false,
        visible:     f.visible ?? true,
        required:    f.required,
        placeholder: f.placeholder ?? null,
        options:     (f.options ?? null) as never,      // JSON serializado no middleware
        validation:  (f.validation ?? null) as never,   // JSON serializado no middleware
        hiddenCategories: (f.hiddenCategories ?? null) as never, // JSON serializado no middleware
        requiredCategories: (f.requiredCategories ?? null) as never, // JSON serializado no middleware
        order:       f.order,
      }
      await this.prisma.screenField.upsert({
        where:  { screenId_fieldKey: { screenId, fieldKey } },
        create: { ...(fldOcupados.has(f.id) ? {} : { id: f.id }), screenId, fieldKey, ...data },
        update: data,
      })
    }

    const removidas = chavesRemovidas(customAntes, dto.fields)
    if (removidas.length) {
      await this.prisma.screenField.deleteMany({
        where: { fieldKey: { in: removidas }, screen: { organizationId, subjectType } },
      })
    }

    await this.propagarCamposDoTipo(organizationId, subjectType)
  }

  /**
   * Um campo personalizado é do TIPO (Contrato/Fornecedor), não da tela que o criou.
   * Depois de salvar uma tela, TODA tela do mesmo subject passa a ter uma linha para cada
   * campo do tipo. Onde o campo não nasceu, ele entra APAGADO — não aparece, não é travado
   * e não é obrigatório: a tela sabe que o campo existe, e quem decide mostrar é o admin.
   *
   * A definição (rótulo, tipo, opções, validação) vem da linha CANÔNICA — aquela cujo `id`
   * é a própria chave, ou a mais recente se a tela de origem foi apagada — e é reaplicada
   * nas cópias a cada save: referência com resolução viva, não duplicata que diverge.
   * As três chaves da tela (aparece / pode editar / obrigatório), a seção e a ordem são de
   * CADA tela e nunca são sobrescritas aqui.
   */
  private async propagarCamposDoTipo(organizationId: string, subjectType: string) {
    const telas = await this.prisma.screen.findMany({
      where:   { organizationId, subjectType },
      include: { sections: true, fields: true },
    })
    if (telas.length < 2) return   // uma tela só: não há para onde propagar

    const secoesPorId = new Map(telas.flatMap(t => t.sections).map(sec => [sec.id, sec]))

    const canonico = catalogoCanonico(telas.flatMap(t => t.fields))
    if (canonico.size === 0) return

    for (const tela of telas) {
      const jaTem = new Map(tela.fields.filter(f => f.source === 'CUSTOM').map(f => [chaveDoCampo(f), f]))
      for (const [chave, def] of canonico) {
        const defs = {
          name:        def.name,
          label:       def.label,
          type:        def.type,
          placeholder: def.placeholder,
          options:     def.options as never,
          validation:  def.validation as never,
        }
        const existente = jaTem.get(chave)
        if (existente) {
          if (existente.id !== def.id) await this.prisma.screenField.update({ where: { id: existente.id }, data: defs })
          continue
        }
        await this.prisma.screenField.create({
          data: {
            screenId:  tela.id,
            fieldKey:  chave,
            sectionId: await this.secaoEspelho(tela, def.sectionId ?? null, secoesPorId.get(def.sectionId ?? '') ?? null),
            ...defs,
            source:    'CUSTOM',
            nativeKey: null,
            mode:      'EDIT',
            visible:   false,   // entra apagado nas telas onde não nasceu
            locked:    false,
            required:  false,
            order:     def.order,
          },
        })
      }
    }
  }

  /**
   * Onde encaixar o campo espelhado: a seção equivalente da tela de destino (mesma chave
   * nativa, ou mesmo slug).
   *
   * ⚠️ Seção NATIVA não se copia. O id dela é DETERMINÍSTICO por tipo
   * (`nsec_<subject>_<chave>`, ver buildNativeSeed) e é o mesmo em todas as telas do
   * subject — tanto que uma tela personalizada costuma não ter linha própria de seção
   * nenhuma: o construtor reconstrói as nativas ao abrir. Repetir o mesmo id põe o campo
   * no lugar certo sem criar nada; criar aqui duplicaria "Dados Gerais" na tela.
   * Só uma seção realmente PERSONALIZADA, ausente no destino, é criada junto — sem ela o
   * campo não teria onde morar, e é reversível (some com o campo, pelo cascade).
   */
  private async secaoEspelho(
    tela: { id: string; sections: { id: string; nativeKey: string | null; name: string; order: number }[] },
    sectionIdOrigem: string | null,
    origem: { label: string; name: string; nativeKey: string | null; defaultOpen: boolean } | null,
  ): Promise<string | null> {
    if (!sectionIdOrigem) return null
    const alvo = tela.sections.find(x => origem?.nativeKey ? x.nativeKey === origem.nativeKey : x.name === origem?.name)
    if (alvo) return alvo.id
    if (!origem || origem.nativeKey || sectionIdOrigem.startsWith('nsec_')) return sectionIdOrigem
    const nova = await this.prisma.screenSection.create({
      data: {
        screenId:    tela.id,
        label:       origem.label,
        name:        origem.name,
        source:      'CUSTOM',
        nativeKey:   null,
        visible:     true,   // a seção não some sozinha: quem esconde é o campo apagado
        locked:      false,
        defaultOpen: origem.defaultOpen,
        order:       tela.sections.reduce((m, x) => Math.max(m, x.order), -1) + 1,
      },
    })
    tela.sections.push({ id: nova.id, nativeKey: null, name: nova.name, order: nova.order })
    return nova.id
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

  async putValues(
    organizationId: string,
    subjectType: string,
    subjectId: string,
    values: ScreenValueDto[],
    autor?: { nome: string; id?: string },
  ) {
    /* No fio, `fieldId` é a CHAVE do campo no tipo (fieldKey) — a mesma em todas as telas.
       Várias linhas compartilham a chave (uma por tela); para o snapshot de nome/rótulo
       vale a mais antiga, que é a canônica. O escopo por organização passa pela tela:
       antes daqui a busca era global, e o comentário "de outra org → ignora" era falso. */
    const chaves = values.map(v => v.fieldId)
    const fields = await this.prisma.screenField.findMany({
      where:   { fieldKey: { in: chaves.length ? chaves : ['__none__'] }, screen: { organizationId } },
      orderBy: { createdAt: 'asc' },
    })
    const byId = new Map<string, (typeof fields)[number]>()
    for (const f of fields) {
      const k = chaveDoCampo(f)
      if (!byId.has(k)) byId.set(k, f)
    }

    /* Foto do ANTES, para o histórico. Precisa ser lida aqui: depois do upsert o valor
       anterior não existe mais em lugar nenhum — campo personalizado não tem versão. */
    const antes = new Map<string, string>()
    for (const r of await this.prisma.screenFieldValue.findMany({
      where: { organizationId, subjectType, subjectId },
      select: { fieldId: true, value: true },
    })) {
      antes.set(r.fieldId, r.value)
    }

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

    await this.auditarCustom(subjectType, subjectId, antes, values, byId, autor)
    return this.getValues(organizationId, subjectType, subjectId)
  }

  /** Registra no histórico da entidade o que mudou nos campos personalizados.
   *
   *  Antes disto, campo personalizado mudava em SILÊNCIO: o histórico do parceiro
   *  mostrava "razão social alterada" e escondia "classificação de risco alterada" — o
   *  que é pior do que não ter histórico, porque dá confiança de que está tudo lá.
   *
   *  Nunca derruba a gravação: o valor já foi salvo, e falhar aqui só perderia o
   *  registro. Falha vira log, não exceção. */
  private async auditarCustom(
    subjectType: string,
    subjectId: string,
    antes: Map<string, string>,
    values: ScreenValueDto[],
    campos: Map<string, { id: string; label: string; type: string; options: unknown }>,
    autor?: { nome: string; id?: string },
  ): Promise<void> {
    try {
      const depois = new Map<string, string>()
      for (const v of values) if (campos.has(v.fieldId)) depois.set(v.fieldId, v.value ?? '')

      const defs = new Map<string, CampoCustom>()
      for (const [id, f] of campos) {
        defs.set(id, {
          id,
          label: f.label,
          type: f.type,
          options: Array.isArray(f.options) ? (f.options as OpcaoCampo[]) : [],
        })
      }

      const mudancas = diffCustom(antes, depois, defs)
      if (mudancas.length === 0) return

      const user = autor?.nome ?? 'Usuário do sistema'
      const userId = autor?.id ?? null

      if (subjectType === 'PARTNER') {
        await this.prisma.partnerAuditLog.create({
          data: { partnerId: subjectId, user, userId, event: 'ALTERADO', changes: mudancas as never },
        })
      } else if (subjectType === 'CONTRACT') {
        await this.prisma.contractAuditLog.create({
          data: { contractId: subjectId, user, userId, event: 'ALTERADO', changes: mudancas as never },
        })
      }
      /* PROCESS_INSTANCE fica de fora: o processo já registra cada passo em
         workflow_events, e duplicar ali produziria histórico em dobro. */
    } catch (e) {
      this.logger.error(`falha ao auditar campos personalizados de ${subjectType}/${subjectId}: ${String(e)}`)
    }
  }
}
