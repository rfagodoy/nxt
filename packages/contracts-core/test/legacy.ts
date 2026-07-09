/* CÓPIAS VERBATIM das implementações que existiam ANTES do @nxt/contracts-core.
   Existem só para o teste de paridade provar que a extração não mudou nenhum número.
   NÃO importar em código de produção. NÃO "corrigir" nada aqui — se um valor está
   errado, o certo é o teste registrar a divergência, não este arquivo mudar.

   Origem:
     front   → apps/web/src/lib/contract-options.ts (aditivoAtivo/terminoVigente/valorVigente/parcelaVigente)
     backend → apps/api/src/notifications/contract-scheduler.service.ts (helpers privados) */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* ── front: opera sobre ContractFormValues (todo valor é string) ── */

export const aditivoAtivoFront = (a: any) => a.situacao === 'ATIVO'

export function terminoVigenteFront(v: any): string {
  let t = v.terminoVigencia
  for (const a of v.aditivos) if (aditivoAtivoFront(a) && a.alteraTermino && a.novoTermino) t = a.novoTermino
  for (const r of (v.renovacoes ?? [])) if (r.novoTermino && r.novoTermino > t) t = r.novoTermino
  return t
}

export function valorVigenteFront(v: any): number {
  let val = parseFloat(v.valorTotal) || 0
  for (const a of v.aditivos) if (aditivoAtivoFront(a) && a.alteraValor && a.novoValor) val += parseFloat(a.novoValor) || 0
  for (const r of (v.reajustesRealizados ?? [])) val += (parseFloat(r.valorNovo) || 0) - (parseFloat(r.valorAnterior) || 0)
  for (const r of (v.renovacoes ?? [])) val += parseFloat(r.valorPeriodo || '') || 0
  return val
}

export function parcelaVigenteFront(v: any): string {
  let p = v.valorParcela
  const eventos: { data: string; val: string }[] = [
    ...v.aditivos.filter((a: any) => aditivoAtivoFront(a) && a.alteraValor && a.novaParcela).map((a: any) => ({ data: a.data, val: a.novaParcela })),
    ...(v.reajustesRealizados ?? []).filter((r: any) => r.parcelaNova).map((r: any) => ({ data: r.competencia, val: r.parcelaNova })),
  ].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  for (const e of eventos) if (e.val) p = e.val
  return p
}

/* ── backend: opera sobre o registro cru do Prisma (valor é number) ── */

export function terminoVigenteBack(c: any): string {
  let t = c.terminoVigencia ?? ''
  for (const a of ((c.aditivos as any[]) ?? [])) if (a.situacao !== 'RASCUNHO' && a.alteraTermino && a.novoTermino) t = a.novoTermino
  for (const r of ((c.renovacoes as any[]) ?? [])) if (r.novoTermino && r.novoTermino > t) t = r.novoTermino
  return t
}

export function valorVigenteBack(c: any): number {
  let v = Number(c.valorTotal) || 0
  for (const a of ((c.aditivos as any[]) ?? [])) if (a.situacao !== 'RASCUNHO' && a.alteraValor && a.novoValor != null) v += Number(a.novoValor) || 0
  for (const r of ((c.reajustesRealizados as any[]) ?? [])) v += (Number(r.valorNovo) || 0) - (Number(r.valorAnterior) || 0)
  for (const r of ((c.renovacoes as any[]) ?? [])) v += Number(r.valorPeriodo) || 0
  return v
}

export function parcelaVigenteBack(c: any): number {
  let p = Number(c.valorParcela) || 0
  const eventos = [
    ...((c.aditivos as any[]) ?? []).filter(a => a.situacao !== 'RASCUNHO' && a.alteraValor && a.novaParcela != null).map(a => ({ data: String(a.data ?? ''), val: Number(a.novaParcela) })),
    ...((c.reajustesRealizados as any[]) ?? []).filter(r => Number(r.parcelaNova)).map(r => ({ data: String(r.competencia ?? ''), val: Number(r.parcelaNova) })),
  ].sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0))
  for (const e of eventos) if (e.val) p = e.val
  return p
}

export function consumoBack(c: any): number {
  const arr = (c.natureza === 'RECEITA' ? c.recebimentos : c.pagamentos) as any[]
  return (arr ?? []).reduce((s, l) => s + ((l.status ?? 'pago') === 'pago' ? Number(l.valor) || 0 : 0), 0)
}

/* ── backend: laço de geração de parcelas da RENOVAÇÃO automática, como era
      em contract-scheduler.service.ts antes de usar gerarParcelas() ── */
function addToDateLegacy(iso: string, anos: number, meses: number, dias: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCFullYear(dt.getUTCFullYear() + anos)
  dt.setUTCMonth(dt.getUTCMonth() + meses)
  dt.setUTCDate(dt.getUTCDate() + dias)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Reproduz o laço antigo. Devolve as parcelas do período e o novo `ultimoVenc`. */
export function renovacaoLegacy(ultimoVenc: string, qtd: number, parcelaVig: number, stamp: number, guard: number) {
  const lancs: any[] = []
  for (let i = 1; i <= qtd; i++) {
    const venc = addToDateLegacy(ultimoVenc.slice(0, 10), 0, i, 0)
    lancs.push({ id: `l_${stamp}_${guard}_${i}`, status: 'previsto', vencimento: venc, data: '', valor: parcelaVig, forma: '', documento: '', observacao: '' })
  }
  return { lancs, ultimoVenc: addToDateLegacy(ultimoVenc.slice(0, 10), 0, qtd, 0) }
}

/* ── conversor: registro cru (numbers) → shape do formulário (strings),
      espelhando contractFromApi de contract-options.ts ── */
export function toForm(c: any): any {
  const arr = (x: unknown) => (Array.isArray(x) ? x : [])
  const numStr = (x: unknown) => (x != null ? String(x) : '')
  const lanc = (x: unknown) => arr(x).map((l: any) => ({ ...l, status: l.status ?? 'pago', valor: numStr(l.valor) }))
  return {
    ...c,
    natureza: c.natureza ?? '',
    valorTotal: numStr(c.valorTotal), valorParcela: numStr(c.valorParcela), qtdParcelas: numStr(c.qtdParcelas),
    pagamentos: lanc(c.pagamentos), recebimentos: lanc(c.recebimentos),
    aditivos: arr(c.aditivos).map((a: any) => ({
      ...a,
      situacao: a.situacao ?? 'ATIVO',           // contractFromApi normaliza legado p/ ATIVO
      novoValor: a.novoValor != null ? String(a.novoValor) : '',
      novaParcela: a.novaParcela != null ? String(a.novaParcela) : '',
    })),
    renovacoes: arr(c.renovacoes).map((r: any) => ({ ...r, valorPeriodo: numStr(r.valorPeriodo) })),
    reajustesRealizados: arr(c.reajustesRealizados).map((r: any) => ({
      ...r,
      valorAnterior: numStr(r.valorAnterior), valorNovo: numStr(r.valorNovo),
      parcelaAnterior: numStr(r.parcelaAnterior), parcelaNova: numStr(r.parcelaNova),
    })),
  }
}
