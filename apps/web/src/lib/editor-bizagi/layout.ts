/* ─── Operações do desenho novo: orientação, fases, piscinas externas, mensagens, tamanhos ───
   Puras: devolvem o MESMO desenho quando nada muda. Quem escreve grava um `layout` completo
   (cópia de LAYOUT_PADRAO + a mudança), então o desenho só ganha `layout` quando alguém mexe. */
import type { DesenhoV2, FaseDesenho, LayoutDesenho, PiscinaExterna } from '@nxt/types'
import { LAYOUT_PADRAO } from '@nxt/workflow-core'
import { GRADE } from '@/lib/desenho-bpmn'
import type { Orientacao } from './geometria'

export const FASE_LARGURA_PADRAO = 320
export const FASE_LARGURA_MINIMA = 160
export const PISCINA_LARGURA_PADRAO = 1280
export const PISCINA_LARGURA_MINIMA = 640
export const FORMA_MINIMA = { largura: 128, altura: 64 }
const TIPOS_REDIMENSIONAVEIS: readonly string[] = ['userTask', 'serviceTask', 'subProcess']
/** Só tarefa, ação automática e subprocesso mudam de tamanho no desenho. */
export const ehRedimensionavel = (tipo: string): boolean => TIPOS_REDIMENSIONAVEIS.includes(tipo)

const naGrade = (v: number) => Math.round(v / GRADE) * GRADE
const sufixo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
const idFase = () => 'fase_' + sufixo()
const idPiscina = () => 'ext_' + sufixo()
const idMensagem = () => 'msg_' + sufixo()

export const layoutDe = (d: DesenhoV2): LayoutDesenho => d.layout ?? LAYOUT_PADRAO

const comLayout = (d: DesenhoV2, l: LayoutDesenho): DesenhoV2 => ({ ...d, layout: l })

function idLivre(usados: Set<string>, gerarId: () => string): string {
  let id = gerarId()
  for (let n = 2; usados.has(id); n++) id = `${gerarId()}_${n}`
  return id
}

export function mudarOrientacao(d: DesenhoV2, o: Orientacao): DesenhoV2 {
  const l = layoutDe(d)
  if (l.orientacao === o) return d
  return comLayout(d, { ...l, orientacao: o })
}

/* ── fases ── */

export function adicionarFase(d: DesenhoV2, gerarId: () => string = idFase): DesenhoV2 {
  const l = layoutDe(d)
  const usados = new Set(l.fases.map((f) => f.id))
  const novas: FaseDesenho[] = []
  if (l.fases.length === 0) {
    novas.push({ id: idLivre(usados, gerarId), nome: 'Fase 1', largura: l.larguraPiscina ?? PISCINA_LARGURA_PADRAO })
    usados.add(novas[0].id)
  }
  novas.push({ id: idLivre(usados, gerarId), nome: 'Nova fase', largura: FASE_LARGURA_PADRAO })
  return comLayout(d, { ...l, fases: [...l.fases, ...novas] })
}

function trocarFase(d: DesenhoV2, id: string, muda: (f: FaseDesenho) => FaseDesenho): DesenhoV2 {
  const l = layoutDe(d)
  const i = l.fases.findIndex((f) => f.id === id)
  if (i === -1) return d
  const antiga = l.fases[i]
  const nova = muda(antiga)
  if (nova.nome === antiga.nome && nova.largura === antiga.largura && nova.prazoDiasUteis === antiga.prazoDiasUteis) return d
  return comLayout(d, { ...l, fases: l.fases.map((f, j) => (j === i ? nova : f)) })
}

/** Nome em branco é cancelar. */
export function renomearFase(d: DesenhoV2, id: string, nome: string): DesenhoV2 {
  const limpo = nome.trim()
  if (!limpo) return d
  return trocarFase(d, id, (f) => ({ ...f, nome: limpo }))
}

export function redimensionarFase(d: DesenhoV2, id: string, largura: number): DesenhoV2 {
  if (!Number.isFinite(largura)) return d
  const w = naGrade(Math.max(FASE_LARGURA_MINIMA, largura))
  return trocarFase(d, id, (f) => ({ ...f, largura: w }))
}

export function removerFase(d: DesenhoV2, id: string): DesenhoV2 {
  const l = layoutDe(d)
  if (!l.fases.some((f) => f.id === id)) return d
  return comLayout(d, { ...l, fases: l.fases.filter((f) => f.id !== id) })
}

/** Prazo da fase em dias úteis; sem `dias` (ou inválido) remove o prazo. */
export function prazoDaFase(d: DesenhoV2, id: string, dias?: number): DesenhoV2 {
  const valido = dias !== undefined && Number.isFinite(dias) && dias > 0 ? Math.round(dias) : undefined
  return trocarFase(d, id, (f) => {
    const { prazoDiasUteis: _, ...resto } = f
    return valido === undefined ? resto : { ...resto, prazoDiasUteis: valido }
  })
}

/* ── piscinas externas ── */

export function adicionarPiscinaExterna(d: DesenhoV2, gerarId: () => string = idPiscina): DesenhoV2 {
  const l = layoutDe(d)
  const id = idLivre(new Set(l.piscinasExternas.map((p) => p.id)), gerarId)
  const nova: PiscinaExterna = { id, nome: 'Participante externo', altura: 96, quem: 'contratada', canal: 'portal' }
  return comLayout(d, { ...l, piscinasExternas: [...l.piscinasExternas, nova] })
}

export function atualizarPiscinaExterna(d: DesenhoV2, id: string, patch: Partial<Omit<PiscinaExterna, 'id'>>): DesenhoV2 {
  const l = layoutDe(d)
  const i = l.piscinasExternas.findIndex((p) => p.id === id)
  if (i === -1) return d
  const atual = l.piscinasExternas[i]
  const nova: PiscinaExterna = { ...atual, ...patch, id }
  if ((Object.keys(nova) as Array<keyof PiscinaExterna>).every((k) => nova[k] === atual[k])) return d
  return comLayout(d, { ...l, piscinasExternas: l.piscinasExternas.map((p, j) => (j === i ? nova : p)) })
}

export function removerPiscinaExterna(d: DesenhoV2, id: string): DesenhoV2 {
  const l = layoutDe(d)
  if (!l.piscinasExternas.some((p) => p.id === id)) return d
  return comLayout(d, {
    ...l,
    piscinasExternas: l.piscinasExternas.filter((p) => p.id !== id),
    fluxosMensagem: l.fluxosMensagem.filter((m) => m.de !== id && m.para !== id),
  })
}

/* ── fluxos de mensagem ── */

const SO_ENTRE_PISCINAS = 'Fluxo de mensagem liga piscinas diferentes. Dentro da mesma piscina, use Sequência.'

export function podeLigarMensagem(d: DesenhoV2, de: string, para: string): string | null {
  const l = layoutDe(d)
  if (de === para) return SO_ENTRE_PISCINAS
  const externa = (id: string) => l.piscinasExternas.some((p) => p.id === id)
  if (!externa(de) && !externa(para)) return SO_ENTRE_PISCINAS
  if (l.fluxosMensagem.some((m) => m.de === de && m.para === para)) return 'Já existe um fluxo de mensagem entre esses dois.'
  return null
}

export function ligarMensagem(d: DesenhoV2, de: string, para: string, gerarId: () => string = idMensagem): DesenhoV2 {
  if (podeLigarMensagem(d, de, para)) return d
  const l = layoutDe(d)
  const id = idLivre(new Set(l.fluxosMensagem.map((m) => m.id)), gerarId)
  return comLayout(d, { ...l, fluxosMensagem: [...l.fluxosMensagem, { id, de, para }] })
}

/** Rótulo em branco tira o rótulo. */
export function rotularMensagem(d: DesenhoV2, id: string, rotulo: string): DesenhoV2 {
  const l = layoutDe(d)
  const m = l.fluxosMensagem.find((x) => x.id === id)
  if (!m) return d
  const limpo = rotulo.trim()
  if ((m.rotulo ?? '') === limpo) return d
  const { rotulo: _, ...resto } = m
  const nova = limpo ? { ...resto, rotulo: limpo } : resto
  return comLayout(d, { ...l, fluxosMensagem: l.fluxosMensagem.map((x) => (x.id === id ? nova : x)) })
}

export function apagarMensagem(d: DesenhoV2, id: string): DesenhoV2 {
  const l = layoutDe(d)
  if (!l.fluxosMensagem.some((m) => m.id === id)) return d
  return comLayout(d, { ...l, fluxosMensagem: l.fluxosMensagem.filter((m) => m.id !== id) })
}

/* ── tamanhos ── */

export function redimensionarForma(d: DesenhoV2, id: string, tam: { largura: number; altura: number }): DesenhoV2 {
  const f = d.formas.find((x) => x.id === id)
  if (!f || !ehRedimensionavel(f.tipo)) return d
  if (!Number.isFinite(tam.largura) || !Number.isFinite(tam.altura)) return d
  const l = layoutDe(d)
  const novo = {
    largura: naGrade(Math.max(FORMA_MINIMA.largura, tam.largura)),
    altura: naGrade(Math.max(FORMA_MINIMA.altura, tam.altura)),
  }
  const atual = l.tamanhos[id]
  if (atual && atual.largura === novo.largura && atual.altura === novo.altura) return d
  return comLayout(d, { ...l, tamanhos: { ...l.tamanhos, [id]: novo } })
}

export function larguraDaPiscina(d: DesenhoV2, w: number): DesenhoV2 {
  if (!Number.isFinite(w)) return d
  const l = layoutDe(d)
  const nova = naGrade(Math.max(PISCINA_LARGURA_MINIMA, w))
  if (l.larguraPiscina === nova) return d
  return comLayout(d, { ...l, larguraPiscina: nova })
}
