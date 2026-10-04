/**
 * Estrutura NATIVA (seções + campos) de cada tipo de tela. Quando uma tela é criada
 * para Fornecedor/Contrato, o construtor pré-carrega essa estrutura: os nativos entram
 * como seções/campos `source: 'NATIVE'` — no cadastro renderizam com seus WIDGETS REAIS
 * e a tela só controla a VISIBILIDADE (nome/tipo/tamanho são do sistema, não editáveis).
 */
import type { Screen, ScreenSection, ScreenField, ScreenSubject, ScreenFieldType } from './types'

/* ─── campos nativos do Fornecedor ─── */

export interface NativeField {
  key:      string
  label:    string
  section:  string
  hint?:    string
  /** Forma do dado no cadastro (o widget real do formulário). Ausente = texto.
   *  ⚠️ Espelha `partner-fields.tsx` (web): mudou o widget lá, mude aqui junto — é daqui que a
   *  coluna "Tipo" do construtor de Telas fala. */
  type?:    ScreenFieldType
}

export const NATIVE_FIELDS: NativeField[] = [
  // Identificação
  { key: 'cnpj',            section: 'identificacao', label: 'CNPJ',                hint: 'PJ Brasileira'    },
  { key: 'cpf',             section: 'identificacao', label: 'CPF',                 hint: 'PF Brasileira'    },
  { key: 'codigo',          section: 'identificacao', label: 'Código / Documento',  hint: 'Estrangeiras'     },
  { key: 'razao_social',    section: 'identificacao', label: 'Razão Social / Nome'                           },
  { key: 'nome_fantasia',   section: 'identificacao', label: 'Nome Fantasia',       hint: 'Somente PJ'       },
  { key: 'data_abertura',   section: 'identificacao', label: 'Data de Abertura',    hint: 'Somente PJ', type: 'date' },
  { key: 'natureza_juridica', section: 'identificacao', label: 'Natureza Jurídica', hint: 'PJ Brasileira', type: 'select' },
  { key: 'ie',              section: 'identificacao', label: 'Inscrição Estadual',  hint: 'PJ Brasileira'    },
  { key: 'im',              section: 'identificacao', label: 'Inscrição Municipal', hint: 'PJ Brasileira'    },
  { key: 'rg',              section: 'identificacao', label: 'RG',                  hint: 'PF Brasileira'    },
  { key: 'orgao_expedidor', section: 'identificacao', label: 'Órgão Expedidor',     hint: 'PF Brasileira'    },
  { key: 'data_nascimento', section: 'identificacao', label: 'Data de Nascimento',  hint: 'Pessoa Física', type: 'date' },
  { key: 'pais_origem',     section: 'identificacao', label: 'País de Origem',      hint: 'Estrangeiras', type: 'select' },
  // CNAE
  { key: 'cnae_principal',    section: 'cnae', label: 'CNAE Principal',     hint: 'Somente PJ', type: 'select' },
  { key: 'cnaes_secundarios', section: 'cnae', label: 'CNAEs Secundários',  hint: 'Somente PJ · quantidade', type: 'multiselect' },
  // Contato
  { key: 'con_email',       section: 'contato',       label: 'E-mail', type: 'email' },
  { key: 'con_nome',        section: 'contato',       label: 'Nome do Contato'                               },
  { key: 'con_telefone',    section: 'contato',       label: 'Telefone', type: 'phone' },
  { key: 'con_celular',     section: 'contato',       label: 'Celular / WhatsApp', type: 'phone' },
  { key: 'con_cargo',       section: 'contato',       label: 'Cargo do Contato'                              },
  { key: 'con_website',     section: 'contato',       label: 'Website',              hint: 'Somente PJ'      },
  // Endereço
  { key: 'end_cep',         section: 'endereco',      label: 'CEP',                  hint: 'Endereço BR'     },
  { key: 'end_estado',      section: 'endereco',      label: 'Estado / UF', type: 'select' },
  { key: 'end_logradouro',  section: 'endereco',      label: 'Logradouro',           hint: 'Endereço BR'     },
  { key: 'end_numero',      section: 'endereco',      label: 'Número',               hint: 'Endereço BR'     },
  { key: 'end_complemento', section: 'endereco',      label: 'Complemento',          hint: 'Endereço BR'     },
  { key: 'end_bairro',      section: 'endereco',      label: 'Bairro',               hint: 'Endereço BR'     },
  { key: 'end_cidade',      section: 'endereco',      label: 'Cidade'                                        },
  { key: 'end_address1',    section: 'endereco',      label: 'Endereço — Linha 1',   hint: 'Endereço EST'    },
  { key: 'end_address2',    section: 'endereco',      label: 'Endereço — Linha 2',   hint: 'Endereço EST'    },
  { key: 'end_pais',        section: 'endereco',      label: 'País',                 hint: 'Endereço EST', type: 'select' },
  // Bancário
  { key: 'ban_banco',       section: 'bancario',      label: 'Banco'                                         },
  { key: 'ban_tipo_conta',  section: 'bancario',      label: 'Tipo de Conta', type: 'select' },
  { key: 'ban_agencia',     section: 'bancario',      label: 'Agência'                                       },
  { key: 'ban_conta',       section: 'bancario',      label: 'Conta'                                         },
  { key: 'ban_pix',         section: 'bancario',      label: 'Chave PIX'                                     },
  // Sócios
  { key: 'soc_nome',        section: 'socios',        label: 'Nome do Sócio'                                 },
  { key: 'soc_documento',   section: 'socios',        label: 'CPF / Documento'                               },
  { key: 'soc_participacao',section: 'socios',        label: 'Participação %', type: 'number' },
  { key: 'soc_cargo',       section: 'socios',        label: 'Cargo / Função'                                },
]


export interface NativeSectionDef { key: string; label: string; defaultOpen?: boolean }
/** `type` é a FORMA do dado no cadastro (o widget real). Ausente = texto.
 *  É o que a coluna "Tipo" do construtor mostra — nativo e personalizado falam a mesma
 *  língua ali. ⚠️ Espelha o formulário: mudou o widget, mude aqui junto. */
export interface NativeFieldDef { key: string; label: string; type?: ScreenFieldType }
export interface NativeStructure { sections: NativeSectionDef[]; fieldsBySection: Record<string, NativeFieldDef[]> }

/* ── Fornecedor: derivado de NATIVE_FIELDS (partner) ── */
const FORN_SECTIONS: NativeSectionDef[] = [
  { key: 'identificacao', label: 'Identificação', defaultOpen: true },
  { key: 'cnae',          label: 'CNAE — Atividades Econômicas' },
  { key: 'contato',       label: 'Contato' },
  { key: 'endereco',      label: 'Endereço' },
  { key: 'bancario',      label: 'Dados Bancários' },
  { key: 'socios',        label: 'Quadro de Sócios' },
  { key: 'historico',     label: 'Histórico' }, // seção-bloco (auditoria): só liga/desliga, só no detalhe
]
const FORN_FIELDS: NativeStructure['fieldsBySection'] = FORN_SECTIONS.reduce((acc, s) => {
  acc[s.key] = NATIVE_FIELDS.filter(f => f.section === s.key).map(f => ({ key: f.key, label: f.label, type: f.type }))
  return acc
}, {} as NativeStructure['fieldsBySection'])

/* ── Contrato (R3): estrutura completa espelhando o cadastro real ──
   Seções de CAMPOS (dados_gerais, vigencia, valor) têm campos nativos com toggle de
   visibilidade. Seções-BLOCO (partes, pagamentos, recebimentos, reajuste, aditivos,
   documentos, historico) são componentes atômicos: a tela controla só se a seção
   aparece; não há toggle campo a campo (ver CONTRACT_BLOCK_SECTIONS na layout). */
const CONTR_SECTIONS: NativeSectionDef[] = [
  { key: 'dados_gerais', label: 'Dados Gerais', defaultOpen: true },
  { key: 'partes',       label: 'Partes Envolvidas' }, // logo após Dados Gerais (decisão do PO, só no Contrato)
  { key: 'vigencia',     label: 'Vigência' },
  { key: 'valor',        label: 'Valor e Pagamento' },
  { key: 'pagamentos',   label: 'Pagamentos realizados' },
  { key: 'recebimentos', label: 'Recebimentos realizados' },
  { key: 'reajuste',     label: 'Reajuste' },
  { key: 'aditivos',     label: 'Aditivos' },
  { key: 'documentos',   label: 'Documentos do contrato' },
  { key: 'historico',    label: 'Histórico' },
]
const CONTR_FIELDS: NativeStructure['fieldsBySection'] = {
  /* ⚠️ a ordem AQUI espelha a ordem real de renderização do formulário (contract-fields.tsx)
     — o construtor de Telas lista os campos nesta ordem, e reconcileNative a estampa
     nas telas existentes. Mudou o formulário? Mude aqui junto. */
  dados_gerais: [
    { key: 'natureza', label: 'Natureza do contrato', type: 'select' }, { key: 'numero', label: 'Número' },
    { key: 'situacao', label: 'Situação', type: 'select' }, { key: 'titulo', label: 'Título' },
    { key: 'descricao', label: 'Descrição', type: 'textarea' }, { key: 'objeto', label: 'Objeto do contrato', type: 'multiselect' },
    { key: 'tipo', label: 'Tipo de contrato', type: 'select' }, { key: 'data_assinatura', label: 'Data de assinatura', type: 'date' },
    { key: 'mao_de_obra', label: 'Mão de obra alocada', type: 'select' },
  ],
  vigencia: [
    { key: 'inicio', label: 'Início da vigência', type: 'date' }, { key: 'prazo_indeterminado', label: 'Prazo indeterminado', type: 'checkbox' },
    { key: 'termino', label: 'Término da vigência', type: 'date' }, { key: 'acao_termino', label: 'Ao término da vigência', type: 'select' },
  ],
  valor: [
    { key: 'moeda', label: 'Moeda', type: 'select' }, { key: 'condicao_pagamento', label: 'Condição de pagamento', type: 'select' },
    { key: 'valor_total', label: 'Valor total do contrato', type: 'currency' }, { key: 'valor_parcela', label: 'Valor da parcela', type: 'currency' },
    { key: 'forma_pagamento', label: 'Forma de pagamento', type: 'select' }, { key: 'qtd_parcelas', label: 'Quantidade de parcelas', type: 'number' },
    { key: 'complemento', label: 'Complemento do valor', type: 'textarea' },
  ],
  /* seções-bloco: sem campos nativos (o componente é atômico) */
  partes: [], pagamentos: [], recebimentos: [], reajuste: [], aditivos: [], documentos: [], historico: [],
}

export const SUBJECT_NATIVE_STRUCTURE: Record<ScreenSubject, NativeStructure> = {
  FORNECEDOR: { sections: FORN_SECTIONS, fieldsBySection: FORN_FIELDS },
  CONTRATO:   { sections: CONTR_SECTIONS, fieldsBySection: CONTR_FIELDS },
  GENERICA:   { sections: [], fieldsBySection: {} },
}

/** Monta as seções/campos NATIVOS pré-carregados de um tipo. Os ids são ESCOPADOS por
 *  subject (`nsec_<subject>_<key>`), porque uma mesma chave (ex.: `historico`) pode existir
 *  em telas de tipos diferentes — ids globais por chave colidiriam entre telas. */
export function buildNativeSeed(subject: ScreenSubject): { sections: ScreenSection[]; fields: ScreenField[] } {
  const struct = SUBJECT_NATIVE_STRUCTURE[subject]
  const p = subject.toLowerCase()
  const sections: ScreenSection[] = struct.sections.map((s, i) => ({
    id: `nsec_${p}_${s.key}`, label: s.label, name: s.key, source: 'NATIVE', nativeKey: s.key,
    visible: true, order: i, defaultOpen: s.defaultOpen ?? (i === 0),
  }))
  const fields: ScreenField[] = struct.sections.flatMap(s =>
    (struct.fieldsBySection[s.key] ?? []).map((f, i) => ({
      id: `nfld_${p}_${f.key}`, sectionId: `nsec_${p}_${s.key}`, name: f.key, label: f.label,
      type: f.type ?? 'text', source: 'NATIVE', nativeKey: f.key, mode: 'VIEW', visible: true, required: false, order: i,
    } as ScreenField)),
  )
  return { sections, fields }
}

/**
 * Reconcilia uma tela carregada com a estrutura nativa viva: acrescenta seções/campos
 * nativos que faltam (VISÍVEIS por padrão), poda os órfãos, re-parenta os campos nativos
 * para a seção certa e NORMALIZA a ordem dentro de cada seção (nativos na ordem do seed —
 * o construtor espelha o formulário real —, customs depois, ordem relativa preservada) —
 * tudo por `nativeKey`, robusto a ids legados. Preserva CUSTOM e a visibilidade (toggle
 * do usuário).
 */
export function reconcileNative(screen: Screen): Screen {
  const seed = buildNativeSeed(screen.subjectType)
  const seedSecKeys = new Set(seed.sections.map(s => s.nativeKey))
  const seedFldKeys = new Set(seed.fields.map(f => f.nativeKey))
  const seedSecKeyById   = new Map(seed.sections.map(s => [s.id, s.nativeKey ?? '']))
  const seedFieldSecKey  = new Map(seed.fields.map(f => [f.nativeKey ?? '', seedSecKeyById.get(f.sectionId ?? '') ?? '']))

  /* Poda seções/campos NATIVOS fora da estrutura viva (nunca toca CUSTOM). */
  const prunedSections = screen.sections.filter(s => s.source !== 'NATIVE' || seedSecKeys.has(s.nativeKey))
  const prunedFields   = screen.fields.filter(f => f.source !== 'NATIVE' || seedFldKeys.has(f.nativeKey))

  /* Acrescenta as seções nativas que faltam (id do seed, escopado por subject). */
  const secByNative = new Map(prunedSections.filter(s => s.source === 'NATIVE').map(s => [s.nativeKey, s]))
  const maxSecOrder = prunedSections.reduce((m, s) => Math.max(m, s.order), -1)
  const addSections = seed.sections.filter(s => !secByNative.has(s.nativeKey)).map((s, i) => ({ ...s, order: maxSecOrder + 1 + i }))

  /* id REAL de cada seção nativa por nativeKey (existente com id legado OU recém-acrescentada). */
  const secIdByKey = new Map(
    [...prunedSections, ...addSections].filter(s => s.source === 'NATIVE').map(s => [s.nativeKey ?? '', s.id]),
  )
  /* O sistema é dono do LUGAR e da FORMA do campo nativo: seção, rótulo e tipo vêm sempre
     do seed, nunca do que está gravado. Telas salvas antes de os tipos nativos existirem
     guardaram tudo como 'text' — sem reaplicar aqui, a coluna "Tipo" continuaria dizendo
     "Texto" para uma data ou um valor nelas. */
  const seedByNative = new Map(seed.fields.map(f => [f.nativeKey ?? '', f]))
  const reparent = (f: ScreenField): ScreenField => {
    if (f.source !== 'NATIVE') return f
    const seedF     = seedByNative.get(f.nativeKey ?? '')
    const secKey    = seedFieldSecKey.get(f.nativeKey ?? '')
    const targetId  = secKey ? secIdByKey.get(secKey) : undefined
    const sectionId = targetId ?? f.sectionId
    const type      = seedF?.type ?? f.type
    const label     = seedF?.label ?? f.label
    if (sectionId === f.sectionId && type === f.type && label === f.label) return f
    return { ...f, sectionId, type, label }
  }
  const fldByNative = new Map(prunedFields.filter(f => f.source === 'NATIVE').map(f => [f.nativeKey, f]))
  const fields   = prunedFields.map(reparent)
  const addFields = seed.fields.filter(f => !fldByNative.has(f.nativeKey)).map(reparent)

  /* Normaliza a ORDEM dentro de cada seção: nativos seguem o seed (o construtor passa a
     espelhar o formulário real); customs vêm depois, preservando a ordem relativa entre si. */
  const merged = [...fields, ...addFields]
  const seedOrder = new Map(seed.fields.map((f, i) => [f.nativeKey ?? '', i]))
  const bySec = new Map<string, ScreenField[]>()
  for (const f of merged) {
    const k = f.sectionId ?? ''
    bySec.set(k, [...(bySec.get(k) ?? []), f])
  }
  const novaOrdem = new Map<string, number>()
  for (const irmaos of bySec.values()) {
    const nativos = irmaos.filter(f => f.source === 'NATIVE')
      .sort((a, b) => (seedOrder.get(a.nativeKey ?? '') ?? 999) - (seedOrder.get(b.nativeKey ?? '') ?? 999))
    const customs = irmaos.filter(f => f.source !== 'NATIVE').sort((a, b) => a.order - b.order)
    ;[...nativos, ...customs].forEach((f, i) => novaOrdem.set(f.id, i))
  }
  const fieldsFinais = merged.map(f => {
    const o = novaOrdem.get(f.id) ?? f.order
    return o === f.order ? f : { ...f, order: o }
  })

  const changed = prunedSections.length !== screen.sections.length
    || prunedFields.length !== screen.fields.length
    || addSections.length > 0 || addFields.length > 0
    || fieldsFinais.some((f, i) => f !== prunedFields[i])
  if (!changed) return screen
  return { ...screen, sections: [...prunedSections, ...addSections], fields: fieldsFinais }
}

/** Escolhe a tela que comanda o cadastro AVULSO (pelo menu): a padrão ATIVA do tipo,
 *  reconciliada com a estrutura nativa viva. null = sem tela padrão → formulário nativo,
 *  sem trava nenhuma. A API usa a MESMA escolha ao conferir uma gravação. */
export function pickDefaultScreen(screens: Screen[]): Screen | null {
  const def = screens.find(s => s.status === 'ACTIVE' && s.isDefault)
  return def ? reconcileNative(def) : null
}
