/* ─── Frases do "Em resumo" das gavetas do desenho ──────────────────────────────
   Puro. Cada gaveta abre com uma frase em português que diz o elemento inteiro — quem
   configura confere o que entendeu sem ler campo por campo (o padrão das perguntas da
   etapa). A frase sai em TRECHOS: o texto corrido, o termo-chave em negrito (`forte`) e o
   que ainda falta, dito dentro da frase (`falta`). A gaveta só desenha os trechos. */
import type { ConfigFim, ConfigSubprocesso, ConfigTemporizador } from '@nxt/types'

export type Trecho = { t: string; forte?: true; falta?: true }

const p = (t: string): Trecho => ({ t })
const f = (t: string): Trecho => ({ t, forte: true })
const x = (t: string): Trecho => ({ t, falta: true })

/** A frase em texto corrido (o que um leitor de tela lê; usado nos testes). */
export function textoDoResumo(trechos: ReadonlyArray<Trecho>): string {
  return trechos.map((r) => r.t).join('')
}

/** "A", "A e B", "A, B e C". */
export function listaPt(xs: ReadonlyArray<string>): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/* ── losangos ── */

/** Escolha (no bloco ou solta). `seNenhum`: para onde vai quando nenhum caminho serve (o
 *  caso contrário); ausente, o processo para e avisa. `semCondicao`: caminhos sem filtro. */
export function resumoDaEscolha(e: {
  anteriores: ReadonlyArray<string>; pergunta?: string; modo: 'primeiro' | 'todos'; seNenhum?: string; semCondicao?: number
}): Trecho[] {
  const pergunta = e.pergunta?.trim()
  const out: Trecho[] = e.anteriores.length ? [p('Depois de '), f(listaPt(e.anteriores)), p(', o processo ')] : [p('O processo ')]
  out.push(...(pergunta ? [p('pergunta '), f(`“${pergunta}”`)] : [x('faz uma pergunta que ainda não foi escrita')]))
  out.push(...(e.modo === 'todos'
    ? [p(' e segue por '), f('todos os caminhos que servirem')]
    : [p(' e segue pelo '), f('primeiro caminho que servir')]))
  out.push(p('. Se nenhum servir, '), ...(e.seNenhum ? [p('segue por '), f(e.seNenhum)] : [p('o processo '), f('para e avisa')]), p('.'))
  if (e.semCondicao) {
    out.push(p(' '), x(e.semCondicao === 1 ? 'Falta escolher a condição de 1 caminho.' : `Falta escolher a condição de ${e.semCondicao} caminhos.`))
  }
  return out
}

/** "Ao mesmo tempo" (bloco): as frentes começam juntas e o processo espera todas. */
export function resumoDoParalelo(frentes: number): Trecho[] {
  if (frentes <= 1) return [p('Só há '), f('uma frente'), p(': o processo segue quando ela terminar.')]
  return [p('As '), f(`${frentes} frentes`), p(' começam juntas e o processo só segue quando '), f('todas terminarem'), p('.')]
}

/* ── estrutura do desenho ── */

export function resumoDaRaia(r: { papel?: string; total: number; usamOPadrao: number }): Trecho[] {
  if (!r.papel) {
    return [p('Esta raia '), x('não tem executor padrão'), p(': cada tarefa dela escolhe quem faz.'),
      ...(r.total ? [p(` ${plural(r.total, 'tarefa', 'tarefas')} de usuário nesta raia.`)] : [])]
  }
  return [p('As tarefas desta raia são feitas por '), f(r.papel), p(' por padrão'),
    p(r.total ? ` (${r.usamOPadrao} de ${r.total} usam o padrão).` : ' (ainda não há tarefas nela).')]
}

export function resumoDaFase(fase: { formas: number; prazoDiasUteis?: number }): Trecho[] {
  return [f(plural(fase.formas, 'forma', 'formas')), p(' nesta fase. Prazo: '),
    fase.prazoDiasUteis ? f(plural(fase.prazoDiasUteis, 'dia útil', 'dias úteis')) : p('sem prazo'), p('.')]
}

const QUEM_EXTERNO: Record<string, string> = {
  contratada: 'a contratada do contrato', fixo: 'um fornecedor fixo', orgao: 'um órgão ou sistema externo',
}

export function resumoDaPiscinaExterna(e: { nome: string; quem: string; canal: string }): Trecho[] {
  return [f(e.nome.trim() || 'O participante'), p(' é '), f(QUEM_EXTERNO[e.quem] ?? 'um participante externo'),
    ...(e.canal === 'email' ? [p(' e conversa por '), f('e-mail com link seguro')] : [p(' e conversa pelo '), f('portal do fornecedor')]), p('.')]
}

/** Fluxo de mensagem: o que vai, de onde, para onde. */
export function resumoDaMensagem(m: { rotulo?: string; de: string; para: string }): Trecho[] {
  const r = m.rotulo?.trim()
  return [...(r ? [f(r)] : [p('Uma mensagem')]), p(' vai de '), f(m.de), p(' para '), f(m.para), p('.')]
}

export function resumoDaSeta(s: { de: string; para: string }): Trecho[] {
  return [p('Leva de '), f(s.de), p(' para '), f(s.para), p('.')]
}

/* ── formas ── */

const UNIDADE: Record<ConfigTemporizador['unidade'], [string, string]> = {
  diasUteis: ['dia útil', 'dias úteis'], diasCorridos: ['dia corrido', 'dias corridos'], horasUteis: ['hora útil', 'horas úteis'],
}
const DATA_DO_CONTRATO: Record<NonNullable<ConfigTemporizador['campoData']>, [string, string]> = {
  vencimento: ['da', 'data de vencimento'], assinatura: ['da', 'data de assinatura'], inicioVigencia: ['do', 'início da vigência'],
}

export function resumoDoTemporizador(c: ConfigTemporizador): Trecho[] {
  if (c.espera === 'prazo') {
    const [um, varios] = UNIDADE[c.unidade]
    return [p('Espera '), f(plural(c.n, um, varios)), p(' e segue.')]
  }
  const [art, campo] = DATA_DO_CONTRATO[c.campoData ?? 'vencimento']
  if (c.n === 0) return [p(`Espera até ${art === 'da' ? 'a' : 'o'} `), f(campo), p(' do contrato e segue.')]
  return [p('Espera até '), f(`${plural(c.n, 'dia', 'dias')} ${c.sentido === 'depois' ? 'depois' : 'antes'} ${art} ${campo}`), p(' do contrato e segue.')]
}

export function resumoDoSubprocesso(c: Pick<ConfigSubprocesso, 'esperar' | 'levarContrato'> & { workflow?: string }): Trecho[] {
  return [p('Chama o workflow '), c.workflow ? f(c.workflow) : x('(falta escolher qual)'),
    ...(c.levarContrato ? [p(', levando '), f('o contrato do processo')] : []),
    ...(c.esperar ? [p(', e '), f('espera ele terminar'), p(' para seguir.')] : [p(', e '), f('segue na hora'), p(', sem esperar.')])]
}

export function resumoDoFim(variante: string | undefined, c: ConfigFim): Trecho[] {
  const motivo = c.motivo?.trim()
  switch (variante) {
    case 'erro':
      return [p('Encerra o processo '), f('com erro'), ...(motivo ? [p(': “'), f(motivo), p('”.')] : [p('. '), x('Falta o motivo.')])]
    case 'cancela':
      return [f('Cancela'), p(' o processo'), ...(motivo ? [p(' com o motivo “'), f(motivo), p('”')] : []),
        ...(c.avisarQuemIniciou !== false ? [p(' e '), f('avisa quem iniciou')] : []), p('.')]
    case 'terminar':
      return [p('Encerra o processo '), f('inteiro'), p(' na hora, mesmo com outros caminhos ainda abertos.')]
    default:
      return [p('Encerra este caminho. Quando todos os caminhos terminam, o processo fica '), f('Concluído'), p('.')]
  }
}

const QUANDO_AGENDADO: Record<string, string> = {
  contrato: 'para cada contrato, perto de uma data', mes: 'todo mês, num dia fixo', uma: 'uma vez, numa data',
}
const EVENTO_DE_INICIO: Record<string, string> = {
  criado: 'um contrato é criado', situacao: 'um contrato muda de situação', api: 'um sistema externo chama a API',
}

export function resumoDoInicio(variante: string | undefined, c: { quando?: string; evento?: string }): Trecho[] {
  if (variante === 'agendado') return [p('O processo começa sozinho, '), f(QUANDO_AGENDADO[c.quando ?? ''] ?? 'numa data'), p('.')]
  if (variante === 'evento') return [p('O processo começa quando '), f(EVENTO_DE_INICIO[c.evento ?? ''] ?? 'um evento acontece'), p('.')]
  return [p('O processo começa aqui, quando alguém clica em '), f('+ Novo processo'), p('.')]
}

/** Envio de mensagem (tarefa ou evento): para quem e por onde. */
export function resumoDoEnvio(e: { para?: string; canal: string }): Trecho[] {
  return [p('Envia para '), e.para ? f(e.para) : x('(falta escolher para quem)'),
    ...(e.canal === 'email' ? [p(' por '), f('e-mail com link seguro')] : [p(' pelo '), f('portal do fornecedor')]), p('.')]
}

const RECEBIDO: Record<string, string> = {
  assinatura: 'a assinatura concluída no provedor', portal: 'a resposta no portal', email: 'a resposta ao e-mail, com anexo',
}

/** Recebimento de mensagem (tarefa ou evento): de quem e o que conta como recebido. */
export function resumoDoRecebimento(r: { de?: string; recebido: string }): Trecho[] {
  return [p('Espera '), f(RECEBIDO[r.recebido] ?? 'a resposta'), p(' de '), r.de ? f(r.de) : x('(falta escolher de quem)'), p(' e segue.')]
}

export function resumoDoBaseadoEmEvento(saidas: number): Trecho[] {
  if (!saidas) return [p('Espera o primeiro evento que acontecer — '), x('nenhuma seta sai daqui ainda'), p('.')]
  return [p('Espera o '), f('primeiro evento que acontecer'), p(` entre ${plural(saidas, 'saída', 'saídas')} e segue por ele.`)]
}

export function resumoDoParaleloSolto(): Trecho[] {
  return [p('Abre '), f('todos os caminhos'), p(' ao mesmo tempo. Para juntá-los, use outro losango '), f('+'), p('.')]
}
