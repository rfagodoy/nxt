# Editor no estilo Bizagi — PR 1 (Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a tela de parametrização do workflow pelo editor no estilo Bizagi do mockup aprovado (paleta em grade com variações, próximo item, duplo clique para parametrizar, fases, piscinas externas, orientação, raia com executor padrão) e tirar o Roteiro.

**Architecture:** O canvas continua no React Flow (`desenho-bpmn/canvas-bpmn.tsx`); o desenho v2 (`formSchema.desenho`) ganha campos opcionais (variante, configuração da forma, executor da raia, `layout`). Toda a geometria nova (orientação, guias, alinhar, próximo item, herança do executor) vive em funções puras em `apps/web/src/lib/editor-bizagi/`, testadas com vitest; os componentes só desenham. O motor não muda neste PR: os elementos novos são desenháveis e o conversor `desenhoParaBlocos` os recusa na ativação com frase clara.

**Tech Stack:** Next.js + React, @xyflow/react 12.12, TypeScript, vitest (web e workflow-core), Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-03-editor-bizagi-design.md` (§2, §3, §5, §6 e linha 1 de "Entregas"). Mockup: https://claude.ai/artifact/8QjkU7Sx9C6kjMPrcuhZFb

## Global Constraints

- Sem migração de banco. Tudo novo do desenho fica em `formSchema.desenho` (v2, campos **opcionais**).
- Desenho gravado sem os campos novos abre **idêntico**: horizontal, sem fases, sem piscinas externas.
- Salvar rascunho aceita qualquer desenho; **Ativar recusa** elementos que ainda não executam com a frase: `"<nome>" é <rótulo da variante>, que ainda não executa. Troque por outro elemento ou deixe o workflow em rascunho.`
- Neste PR, temporizador, subprocesso, fim com erro e fim com cancelamento têm etiqueta **"Próxima rodada"** (viram "Executa hoje" nos PRs 2–4).
- Grade: a de hoje, `GRADE = 16` (`lib/desenho-bpmn.ts`). O "10 px" da spec era do mockup.
- Cores do Nxt (as classes de `formas.tsx`/`paleta.tsx` de hoje); temas claro e escuro.
- Textos em português, no tom das gavetas atuais (pergunta em negrito, ajuda curta).
- `CHANGELOG.md`: entrada em "Não lançado". Sem número de versão nem tag (docs/versionamento.md).
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Workflow existente (desenho v2 sem `layout`, sem `variante`) abre com as formas nas mesmas posições e ativa como antes → teste em Task 1 e Task 2.
2. Na orientação vertical, mover uma forma grava coordenadas **lógicas**; voltar para horizontal devolve o desenho como estava → teste em Task 3.
3. Apagar uma forma ou uma piscina externa leva junto os fluxos de mensagem que dependiam dela (sem seta órfã no JSON) → teste em Task 4.
4. Herança do executor: mover a tarefa de raia troca o executor; tarefa com executor escolhido à mão não herda; raia sem executor não apaga o da tarefa → teste em Task 5.
5. Próximo item com o lugar ocupado não cria forma em cima de outra (desce até achar espaço, no máximo 8 tentativas) → teste em Task 3.

---

### Task 1: Tipos do desenho e leitura (`@nxt/types`, workflow-core)

**Files:**
- Modify: `packages/types/index.ts:283-320` (tipos do desenho)
- Modify: `packages/workflow-core/src/desenho-livre.ts:13-35` (`TIPOS`, `lerDesenhoV2`)
- Create: `packages/workflow-core/src/variantes.ts`
- Modify: `packages/workflow-core/index.ts` (acrescentar `export * from './src/variantes'`; depois `npm run build -w @nxt/workflow-core`, porque a API e o web leem o `dist`)
- Test: `packages/workflow-core/test/desenho-bizagi.test.ts`

**Interfaces:**
- Produces (em `@nxt/types`):
  - `TipoForma` += `'intermediateEvent' | 'subProcess' | 'eventGateway'`
  - `type VarianteForma = 'simples' | 'agendado' | 'evento' | 'usuario' | 'envio' | 'recebimento' | 'chamada' | 'embutido' | 'temporizador' | 'recebe' | 'envia' | 'erro' | 'cancela' | 'terminar'`
  - `FormaDesenho` += `variante?: VarianteForma; config?: ConfigForma`
  - `type ConfigForma = ConfigTemporizador | ConfigSubprocesso | ConfigFim | Record<string, string | number | boolean>`
  - `interface ConfigTemporizador { espera: 'prazo' | 'data'; n: number; unidade: 'diasUteis' | 'diasCorridos' | 'horasUteis'; campoData?: 'vencimento' | 'assinatura' | 'inicioVigencia'; sentido?: 'antes' | 'depois' }`
  - `interface ConfigSubprocesso { processId?: string; versao: 'ativa' | 'fixa'; versaoFixa?: number; levarContrato: boolean; campos: string[]; esperar: boolean }`
  - `interface ConfigFim { motivo?: string; codigo?: string; avisarQuemIniciou?: boolean }`
  - `RaiaDesenho` += `executor?: StepFormSchema['executor']`
  - `StepFormSchema` += `executorDaRaia?: boolean`
  - `DesenhoV2` += `layout?: LayoutDesenho`
  - `interface LayoutDesenho { orientacao: 'horizontal' | 'vertical'; larguraPiscina?: number; fases: FaseDesenho[]; piscinasExternas: PiscinaExterna[]; fluxosMensagem: FluxoMensagem[]; tamanhos: Record<string, { largura: number; altura: number }> }`
  - `interface FaseDesenho { id: string; nome: string; largura: number; prazoDiasUteis?: number }`
  - `interface PiscinaExterna { id: string; nome: string; altura: number; quem: 'contratada' | 'fixo' | 'orgao'; canal: 'portal' | 'email' }`
  - `interface FluxoMensagem { id: string; de: string; para: string; rotulo?: string }` (de/para = id de forma ou de piscina externa)
- Produces (em workflow-core, `variantes.ts`):
  - `varianteDe(f: Pick<FormaDesenho, 'tipo' | 'variante'>): VarianteForma | undefined` — padrão por tipo: start→`simples`, end→`simples`, userTask→`usuario`, subProcess→`chamada`, intermediateEvent→`temporizador`; sem padrão para os demais.
  - `rotuloDaVariante(f): string` — artigo + nome: "um início agendado", "um início por evento", "um envio de mensagem", "um recebimento de mensagem", "um subprocesso", "um subprocesso embutido", "um temporizador", "um evento que recebe mensagem", "um evento que envia mensagem", "um losango baseado em evento", "um fim com erro", "um fim com cancelamento", "um fim que termina tudo".
  - `executaHoje(f): boolean` — true só para: start simples, userTask usuario, serviceTask, exclusiveGateway, parallelGateway, end simples.
  - `LAYOUT_PADRAO: LayoutDesenho` = `{ orientacao: 'horizontal', fases: [], piscinasExternas: [], fluxosMensagem: [], tamanhos: {} }`

- [ ] **Step 1: Write the failing tests** em `desenho-bizagi.test.ts`:
  - `lerDesenhoV2 aceita os tipos novos e a variante` — desenho com `{ id: 't', tipo: 'intermediateEvent', variante: 'temporizador', config: { espera: 'prazo', n: 5, unidade: 'diasUteis' } }` volta com a forma igual.
  - `lerDesenhoV2 mantém layout válido` — `layout` com 1 fase, 1 piscina externa e 1 fluxo de mensagem volta igual.
  - `lerDesenhoV2 descarta layout malformado sem recusar o desenho` — `layout: { orientacao: 'diagonal' }` → desenho lido, `layout` ausente.
  - `lerDesenhoV2 descarta fluxo de mensagem para id inexistente` — fluxo `de: 'x'` some; o resto do layout fica.
  - `desenho antigo sem layout nem variante lê igual` — fixture de `desenho-livre.test.ts` passa por `lerDesenhoV2` e volta `toEqual` a entrada.
  - `varianteDe, rotuloDaVariante e executaHoje` — tabela com os 6 tipos/variantes que executam (`true`) e `{ tipo: 'end', variante: 'erro' }` (`false`, "um fim com erro").

- [ ] **Step 2: Run** `cd packages/workflow-core && npx vitest run test/desenho-bizagi.test.ts` — Expected: FAIL (tipos/funções inexistentes).

- [ ] **Step 3: Implement** os tipos em `packages/types/index.ts`, `variantes.ts`, e em `lerDesenhoV2`: `TIPOS` com os 3 tipos novos; layout lido por `lerLayout(bruto: unknown, ids: Set<string>): LayoutDesenho | undefined` (privada; `undefined` quando a forma do objeto não confere; filtra fluxos de mensagem cujo `de`/`para` não está em `ids ∪ piscinasExternas`).

- [ ] **Step 4: Run** a mesma suíte e depois `npx vitest run` no pacote — Expected: PASS, nenhuma regressão.

- [ ] **Step 5: Commit** — `git commit -m "Desenho v2: variantes, configuração das formas e layout (piscinas, fases, orientação)"`

### Task 2: Ativação recusa o que ainda não executa

**Files:**
- Modify: `packages/workflow-core/src/desenho-livre.ts` (`desenhoParaBlocos`, ~linha 271)
- Test: `packages/workflow-core/test/desenho-bizagi.test.ts`, `apps/api/src/processes/blocos-da-ativacao.test.ts`

**Interfaces:**
- Consumes: `executaHoje`, `rotuloDaVariante` (Task 1).
- Produces: problema `{ tipo: 'ainda-nao-executa', mensagem, formas: [id], setas: [] }` em `Conversao.problemas`. O editor já destaca a forma culpada por `formas`.

- [ ] **Step 1: Write the failing tests**:
  - `recusa temporizador com a frase da spec` — Início → Tarefa "Analisar" → intermediateEvent temporizador "Esperar 5 dias" → Fim: `ok: false`, problema `ainda-nao-executa` com `mensagem === '"Esperar 5 dias" é um temporizador, que ainda não executa. Troque por outro elemento ou deixe o workflow em rascunho.'` e `formas: ['t']`.
  - `lista todos os que não executam, um problema por forma` — temporizador + fim com erro → 2 problemas.
  - `piscinas externas, fluxos de mensagem e fases não impedem` — desenho válido de hoje + `layout` cheio → `ok: true` e blocos iguais aos sem layout.
  - (API) `blocosDaAtivacao devolve a frase` — `erro` contém a frase; `problemas[0].tipo === 'ainda-nao-executa'`.
- [ ] **Step 2: Run** `npx vitest run test/desenho-bizagi.test.ts` (workflow-core) e `cd apps/api && npx vitest run src/processes/blocos-da-ativacao.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** no início de `desenhoParaBlocos`, antes de percorrer: formas com `!executaHoje(f)` viram problemas; havendo algum, devolve `{ ok: false, problemas }`. O nome na frase é `f.nome?.trim() || opcoes.nomeDe?.(f.id) || 'Sem nome'`.
- [ ] **Step 4: Run** as duas suítes e a suíte inteira do workflow-core — Expected: PASS.
- [ ] **Step 5: Commit** — `"Ativação recusa elementos que ainda não executam"`

### Task 3: Geometria pura do editor (orientação, guias, alinhar, próximo item)

**Files:**
- Create: `apps/web/src/lib/editor-bizagi/geometria.ts`
- Test: `apps/web/src/lib/editor-bizagi/geometria.test.ts`

**Interfaces:**
- Produces:
  - `type Caixa = { id: string; x: number; y: number; largura: number; altura: number }` (x,y = canto superior esquerdo, coordenada **lógica** = horizontal)
  - `type Orientacao = 'horizontal' | 'vertical'`
  - `paraTela(c: Caixa, o: Orientacao): Caixa` — vertical: o **centro** é transposto (cx,cy)→(cy,cx); largura/altura da forma não mudam.
  - `daTela(c: Caixa, o: Orientacao): Caixa` — inversa exata de `paraTela`.
  - `retanguloParaTela(r: Caixa, o): Caixa` — para piscina, raia e fase: o retângulo inteiro é transposto (largura↔altura).
  - `encaixarComGuias(movendo: Caixa, outras: Caixa[], tolerancia = 6): { x: number; y: number; guias: Array<{ eixo: 'x' | 'y'; valor: number }> }` — encaixa o centro em `GRADE` e, se o centro x (ou y) de alguma `outra` estiver a ≤ `tolerancia`, cola nele e devolve a guia.
  - `type ModoAlinhar = 'esquerda' | 'centroX' | 'topo' | 'centroY' | 'distribuirX' | 'distribuirY'`
  - `alinhar(caixas: Caixa[], modo: ModoAlinhar): Record<string, { x: number; y: number }>` — opera em coordenadas **de tela** (o chamador converte); distribuir mantém a primeira e a última pelo centro, iguala os intervalos.
  - `posicaoDoProximo(base: Caixa, novo: { largura: number; altura: number }, ocupadas: Caixa[]): { x: number; y: number }` — lógico: à direita da base, intervalo de `4 * GRADE` entre bordas, centros alinhados em y, na grade; se colidir (folga 16) com alguma `ocupada`, desce `6 * GRADE` e tenta de novo, até 8 vezes; depois disso devolve a última tentativa.

- [ ] **Step 1: Write the failing tests**:
  - `paraTela e daTela são inversas` nas duas orientações (caixa 190×72 em 320,144).
  - `vertical transpõe o centro, não o tamanho` — caixa {x:100,y:40,largura:190,altura:72} → centro (195,76) vira (76,195) → `{ x: -19, y: 159, largura: 190, altura: 72 }`.
  - `horizontal → vertical → horizontal devolve a posição` (Review Focus 2).
  - `encaixarComGuias cola no centro vizinho e devolve a guia` — centro x a 5 px de outro → x igual, `guias: [{ eixo: 'x', valor }]`; a 7 px → só a grade.
  - `alinhar esquerda/topo/centros` e `distribuirX` com 3 caixas desiguais (valores calculados à mão no teste).
  - `posicaoDoProximo ao lado da base` e `desce quando o lugar está ocupado` e `para depois de 8 tentativas` (Review Focus 5).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run src/lib/editor-bizagi/geometria.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `geometria.ts` (importa `GRADE` de `@/lib/desenho-bpmn`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `"Editor: geometria pura (orientação, guias, alinhar, próximo item)"`

### Task 4: Operações do desenho novo (fases, piscinas externas, fluxos de mensagem, tamanhos)

**Files:**
- Create: `apps/web/src/lib/editor-bizagi/layout.ts`
- Modify: `apps/web/src/lib/desenho-bpmn.ts:457-472` (`apagarForma` remove fluxos de mensagem da forma e o tamanho dela)
- Test: `apps/web/src/lib/editor-bizagi/layout.test.ts`

**Interfaces:**
- Consumes: `LayoutDesenho`, `FaseDesenho`, `PiscinaExterna`, `FluxoMensagem`, `LAYOUT_PADRAO` (Task 1).
- Produces (todas puras, devolvem o MESMO `d` quando nada muda):
  - `layoutDe(d: DesenhoV2): LayoutDesenho` (= `d.layout ?? LAYOUT_PADRAO`)
  - `mudarOrientacao(d, o: Orientacao): DesenhoV2`
  - `adicionarFase(d, gerarId?): DesenhoV2` — "Nova fase", largura 320; sem fases, cria "Fase 1" ocupando a piscina e a nova. `renomearFase(d, id, nome)`, `redimensionarFase(d, id, largura)` (mín. 160, na grade), `removerFase(d, id)`, `prazoDaFase(d, id, dias?: number)`.
  - `adicionarPiscinaExterna(d, gerarId?)` — `{ nome: 'Participante externo', altura: 96, quem: 'contratada', canal: 'portal' }`; `atualizarPiscinaExterna(d, id, patch)`; `removerPiscinaExterna(d, id)` (leva os fluxos de mensagem dela).
  - `podeLigarMensagem(d, de, para): string | null` — recusa (frase): mesma forma/piscina; duas formas da piscina principal ("Fluxo de mensagem liga piscinas diferentes. Dentro da mesma piscina, use Sequência."); repetido ("Já existe um fluxo de mensagem entre esses dois.").
  - `ligarMensagem(d, de, para, gerarId?)`, `rotularMensagem(d, id, rotulo)`, `apagarMensagem(d, id)`.
  - `redimensionarForma(d, id, tam: { largura, altura })` — na grade; mínimo 128×64; só `userTask`, `serviceTask`, `subProcess`.
  - `larguraDaPiscina(d, w)` — mínimo 640, na grade.
- [ ] **Step 1: Write the failing tests** — um `it` por função acima, mais: `apagarForma leva os fluxos de mensagem dela` e `removerPiscinaExterna leva os fluxos dela` (Review Focus 3); `podeLigarMensagem` com as três frases exatas.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor-bizagi/layout.test.ts src/lib/desenho-bpmn.test.ts` — Expected: FAIL nos novos.
- [ ] **Step 3: Implement** `layout.ts` e o ajuste em `apagarForma`.
- [ ] **Step 4: Run** — Expected: PASS (inclusive `desenho-bpmn.test.ts` inteiro).
- [ ] **Step 5: Commit** — `"Editor: fases, piscinas externas e fluxos de mensagem no desenho"`

### Task 5: Raia com executor padrão

**Files:**
- Create: `apps/web/src/lib/editor-bizagi/raias.ts`
- Modify: `apps/web/src/components/processes/process-flow.tsx` (onde monta o `formSchema` para Salvar e Ativar — chamar `aplicarExecutorDasRaias` antes de enviar)
- Modify: `apps/web/src/components/processes/perguntas-da-etapa.tsx:443-495` (pergunta "Quem faz?")
- Test: `apps/web/src/lib/editor-bizagi/raias.test.ts`

**Interfaces:**
- Consumes: `RaiaDesenho.executor`, `StepFormSchema.executorDaRaia` (Task 1); `raiaNaAltura` (`lib/desenho-bpmn.ts`).
- Produces:
  - `herdaDaRaia(step: StepFormSchema): boolean` = `step.executorDaRaia ?? !step.executor?.papelId`
  - `raiaDaForma(d: DesenhoV2, id: string, alturaDe: (id: string) => number): RaiaDesenho | undefined` — pelo centro (y + altura/2), como o canvas.
  - `aplicarExecutorDasRaias(steps: StepFormSchema[], d: DesenhoV2, alturaDe): StepFormSchema[]` — para cada `userTask` que herda e cuja raia tem `executor`, devolve o passo com `executor` = o da raia (cópia); os outros passos voltam **o mesmo objeto**.
- [ ] **Step 1: Write the failing tests** (Review Focus 4): `herda quando não tem executor`; `não herda quando escolheu à mão (executorDaRaia: false)`; `passo antigo com executor e sem a marca não herda`; `mover a forma para outra raia troca o executor`; `raia sem executor não apaga o executor da tarefa`; `serviceTask não herda`.
- [ ] **Step 2: Run** `npx vitest run src/lib/editor-bizagi/raias.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `raias.ts`. Em `perguntas-da-etapa.tsx`, "Quem faz?" ganha a primeira opção **"O padrão da raia: <papel>"** (marcada quando `herdaDaRaia`), com ajuda `Herdado de "<raia>". Mudou a raia, muda junto.`; escolher qualquer outra opção grava `executorDaRaia: false`; escolher a da raia grava `executorDaRaia: true`. Sem raia com executor, a opção aparece desabilitada com "Esta raia não tem executor padrão". `process-flow.tsx` aplica `aplicarExecutorDasRaias` no Salvar e no Ativar.
- [ ] **Step 4: Run** a suíte do arquivo e `npx vitest run` em `apps/web` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Raia com executor padrão: a tarefa herda e pode trocar"`

### Task 6: Catálogo e paleta em grade com variações

**Files:**
- Create: `apps/web/src/lib/editor-bizagi/catalogo.ts`
- Modify (reescrita): `apps/web/src/components/processes/desenho-bpmn/paleta.tsx`
- Test: `apps/web/src/lib/editor-bizagi/catalogo.test.ts`

**Interfaces:**
- Consumes: `VarianteForma`, `executaHoje` (Task 1).
- Produces:
  - `type GrupoPaleta = 'inicio' | 'tarefa' | 'subprocesso' | 'losango' | 'intermediario' | 'fim'`
  - `type ItemCatalogo = { grupo: GrupoPaleta; tipo: TipoForma; variante?: VarianteForma; modo?: 'primeiro' | 'todos'; nome: string; etiqueta: 'hoje' | 'proxima' }`
  - `CATALOGO: Record<GrupoPaleta, ItemCatalogo[]>` — na ordem do mockup: Início (Início; Início agendado; Início por evento) · Tarefa (Tarefa de usuário; Ação automática = `serviceTask`; Envio de mensagem; Recebimento de mensagem) · Subprocesso (chama outro workflow; embutido) · Losango (Escolha = exclusive `primeiro`; Ao mesmo tempo = parallel; Inclusivo = exclusive `todos`; Baseado em evento = `eventGateway`) · Intermediário (Temporizador; Recebe mensagem; Envia mensagem) · Fim (Fim; Fim com erro; Fim com cancelamento; Terminar tudo). `etiqueta` = `executaHoje ? 'hoje' : 'proxima'`.
  - `ROTULO_ETIQUETA = { hoje: 'Executa hoje', proxima: 'Próxima rodada' }`
  - `formaNova(item: ItemCatalogo, id: string): FormaDesenho` — nome padrão: tarefa "Nova tarefa", subprocesso "Novo subprocesso", escolha/inclusivo "Nova pergunta?", intermediário = nome do item, início "Início", fim "Fim"; `config` padrão do temporizador `{ espera: 'prazo', n: 1, unidade: 'diasUteis' }`, do subprocesso `{ versao: 'ativa', levarContrato: true, campos: [], esperar: true }`.
  - `PaletaBpmn` props: `{ escolhidas: Record<GrupoPaleta, number>; onTrocarVariante(g: GrupoPaleta, indice: number): void; onEscolher(item: ItemCatalogo): void; conector: 'sequencia' | 'mensagem'; onConector(c): void; onAdicionarRaia(): void; onAdicionarFase(): void; onAdicionarPiscina(): void; desabilitada?: boolean }`. Arrasto: `dataTransfer` em `TIPO_ARRASTO_FORMA` com `JSON.stringify({ grupo, indice })`.
- [ ] **Step 1: Write the failing tests**: `catálogo tem os 6 grupos na ordem do mockup`; `só o que executa hoje tem etiqueta 'hoje'` (temporizador, subprocesso, fins com erro/cancelamento = 'proxima'); `formaNova dá nome e config padrão` (temporizador e subprocesso).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `catalogo.ts`; reescrever `paleta.tsx`: largura 112 px recolhível para 30 px (preferência em `localStorage` `nxt:desenho-bpmn:paleta`, com try/catch), grade de 2 colunas de botões 40×40 só com ícone (nome + etiqueta no `title` e `aria-label`), botão ▾ abre um menu (`FloatingMenu` de `components/ui/floating-menu.tsx`, ancorado no botão) com ícone, nome e chip da etiqueta; conectores Sequência e Fluxo de mensagem com `aria-pressed`; Piscina, Raia e Fase. Ícones: os desenhos SVG das formas, reaproveitando as cores de hoje.
- [ ] **Step 4: Run** a suíte + `npx tsc --noEmit -p apps/web` — Expected: PASS, sem erros de tipo.
- [ ] **Step 5: Commit** — `"Paleta no estilo Bizagi: grade, variações e etiquetas"`

### Task 7: Formas novas no canvas

**Files:**
- Modify: `apps/web/src/components/processes/desenho-bpmn/formas.tsx`
- Modify: `apps/web/src/components/processes/desenho-bpmn/canvas-bpmn.tsx` (projeção das formas, tamanhos)

**Interfaces:**
- Consumes: `varianteDe` (Task 1), `redimensionarForma` (Task 4).
- Produces: `DadosEvento` vira `{ tipo: 'inicio' | 'intermediario' | 'fim'; variante: VarianteForma; nome?: string; problemas: string[] }`; `DadosTarefa` += `variante`, `subprocesso?: 'chamada' | 'embutido'`; `TipoLosango` += `'evento'`; `CanvasBpmnProps` += `onTamanho(id: string, tam: { largura: number; altura: number }): void`.
- [ ] **Step 1: Implement** os ícones por variante como no mockup: relógio (temporizador/agendado), envelope vazado (recebe/evento/recebimento), envelope cheio (envia/envio), raio (erro), X (cancela), disco cheio (terminar); intermediário com anel duplo; subprocesso com o quadrinho "+" embaixo e borda grossa quando `chamada`; losango baseado em evento com o pentágono no círculo duplo. Rótulo de evento/losango continua fora da forma (`RotuloExterno`), agora com o nome da forma (não mais "Início"/"Fim" fixos quando há nome). `NodeResizer` (do @xyflow/react) em tarefa e subprocesso quando selecionados e editáveis, `minWidth 128 minHeight 64`, `onResizeEnd` → `onTamanho`; o canvas usa `layout.tamanhos[id]` quando existir.
- [ ] **Step 2: Verify** `npx tsc --noEmit -p apps/web` e `npx vitest run` em apps/web — Expected: PASS.
- [ ] **Step 3: Verify na tela** (servidor de dev em http://localhost:3000): arrastar cada variante da paleta para o desenho e conferir o ícone nos temas claro e escuro; redimensionar uma tarefa, salvar, recarregar e ver o tamanho mantido.
- [ ] **Step 4: Commit** — `"Desenho: formas das variantes novas e tarefa redimensionável"`

### Task 8: Clique seleciona, duplo clique parametriza, próximo item

**Files:**
- Create: `apps/web/src/components/processes/desenho-bpmn/proximo-item.tsx`
- Modify: `apps/web/src/components/processes/desenho-bpmn/canvas-bpmn.tsx` (eventos de clique, `NodeToolbar` da seleção ~linhas 585-640 e 813-880)
- Modify: `apps/web/src/components/processes/process-flow.tsx` (handlers `onSelecionar`/`onSelecionarSeta` → `onAbrir`)

**Interfaces:**
- Consumes: `posicaoDoProximo`, `paraTela/daTela` (Task 3); `CATALOGO`, `formaNova` (Task 6).
- Produces:
  - `type AlvoDaGaveta = { k: 'forma' | 'seta' | 'raia' | 'fase' | 'piscina' | 'mensagem'; id: string }`
  - `CanvasBpmnProps` += `onAbrir(alvo: AlvoDaGaveta): void`, `onProximo(baseId: string, item: ItemCatalogo, soltoEm?: { x: number; y: number }): void`. `onSelecionar`/`onSelecionarSeta` passam a **só selecionar**.
  - `ProximoItem` props `{ onEscolher(item: ItemCatalogo): void; onArrastar(item: ItemCatalogo, e: DragEvent): void }` — 5 botões: Tarefa de usuário, Escolha, Temporizador │ Subprocesso, Fim (itens do `CATALOGO`).
- [ ] **Step 1: Implement** no canvas: `onNodeClick`/`onEdgeClick` só selecionam; `onNodeDoubleClick`/`onEdgeDoubleClick` e Enter com seleção chamam `onAbrir`; o menu pequeno da seleção (o `NodeToolbar` de hoje) passa a ter **Parametrizar** e **Apagar** (as ações "Próxima: tarefa/escolha" saem dele); `ProximoItem` em `NodeToolbar position={Position.Right}` (abaixo, na vertical) para forma única selecionada que não é Fim; a bolinha de ligar vai para baixo da forma (à direita, na vertical). Raia, fase e piscinas: duplo clique na faixa do nome abre (`k: 'raia' | 'fase' | 'piscina'`). Em `process-flow.tsx`, `onProximo` cria a forma com `formaNova`, posição por `posicaoDoProximo` (ou `soltoEm` na grade, quando arrastada) e a seta de sequência base → nova; um passo de desfazer.
- [ ] **Step 2: Verify** tsc + vitest — Expected: PASS.
- [ ] **Step 3: Verify na tela**: clique numa tarefa mostra a coluna à direita e não abre a gaveta; duplo clique abre; clicar "Escolha" na coluna cria o losango à direita já ligado; clicar de novo cria abaixo (lugar ocupado); arrastar "Fim" para um ponto vazio cria ali, ligado; Ctrl+Z desfaz cada criação de uma vez.
- [ ] **Step 4: Commit** — `"Desenho: clique seleciona, duplo clique parametriza e próximo item ao lado"`

### Task 9: Canvas — grade, guias, laço com alinhar, orientação, fases e piscinas externas

**Files:**
- Modify: `apps/web/src/components/processes/desenho-bpmn/canvas-bpmn.tsx`
- Modify: `apps/web/src/components/processes/desenho-bpmn/formas.tsx` (`FormaRaia`, `FormaPiscina`; novos `FormaFase`, `FormaPiscinaExterna`, seta `SetaMensagem`)
- Modify: `apps/web/src/components/processes/desenho-bpmn/topo.tsx` (novo `ControlesDoDesenho`)

**Interfaces:**
- Consumes: Task 3 inteira; Task 4 inteira.
- Produces: `CanvasBpmnProps` += `orientacao: Orientacao`, `grade: boolean`, `conector: 'sequencia' | 'mensagem'`, `onSelecaoMultipla(ids: string[]): void`, `onLayout(d: DesenhoV2): void` (fases, piscinas, mensagens e tamanhos voltam por aqui); `ControlesDoDesenho` props `{ orientacao; onOrientacao; grade; onGrade; selecionadas: number; onAlinhar(m: ModoAlinhar): void }`.
- [ ] **Step 1: Implement**:
  - **Orientação:** a projeção usa `paraTela` (formas) e `retanguloParaTela` (piscina, raias, fases); `onNodeDragStop` grava `daTela`. Na vertical, os nomes das faixas ficam horizontais no topo e os das fases na vertical à esquerda.
  - **Grade:** `snapToGrid`/`snapGrid=[GRADE, GRADE]` e o `Background` de pontos só com `grade` ligada.
  - **Guias:** durante `onNodeDrag` de uma forma, `encaixarComGuias` contra as outras; as guias desenhadas com `ViewportPortal` (linha tracejada verde) e apagadas no `onNodeDragStop`.
  - **Laço:** `selectionOnDrag` no vazio + Shift soma; `onSelectionChange` → `onSelecaoMultipla`. `ControlesDoDesenho` mostra os 6 botões de alinhar com 2+ selecionadas; aplica `alinhar` em tela e grava `daTela` (um passo de desfazer).
  - **Fases:** faixa de cabeçalho no topo da piscina (altura 28), divisórias tracejadas; alça na borda direita da fase (`redimensionarFase`).
  - **Piscinas externas:** abaixo da principal, 48 px de intervalo; corpo "Participante externo · caixa-preta"; aceita a ponta de um fluxo de mensagem (handle invisível no corpo).
  - **Fluxo de mensagem:** com `conector === 'mensagem'`, puxar da forma até uma piscina externa usa `podeLigarMensagem`/`ligarMensagem` (recusa mostra a frase no balão de recusa de hoje); `SetaMensagem` tracejada com círculo na saída e seta vazada na chegada.
  - **Piscina principal:** alça na borda do fim → `larguraDaPiscina`.
- [ ] **Step 2: Verify** tsc + vitest — Expected: PASS.
- [ ] **Step 3: Verify na tela**: alternar Horizontal/Vertical sem mover nada; mover uma forma na vertical, voltar para horizontal e conferir a posição; guias aparecem ao alinhar centros; laço em 3 formas → alinhar topo; criar fase, piscina externa e fluxo de mensagem; salvar, recarregar, tudo igual.
- [ ] **Step 4: Commit** — `"Desenho: orientação, grade, guias, alinhar, fases, piscinas externas e fluxo de mensagem"`

### Task 10: Gavetas novas

**Files:**
- Create: `apps/web/src/components/processes/desenho-bpmn/gavetas.tsx`
- Modify: `apps/web/src/components/processes/process-flow.tsx` (roteia `AlvoDaGaveta` para a gaveta certa)

**Interfaces:**
- Consumes: `GavetaLateral` (`gaveta.tsx`), `ROTULO_ETIQUETA` (Task 6), funções de `layout.ts` (Task 4), `ConfigTemporizador`/`ConfigSubprocesso`/`ConfigFim` (Task 1).
- Produces (todas com `rotulo` = tipo, chip da etiqueta, e mudança ao vivo + Cancelar/Aplicar como a gaveta da etapa):
  - `GavetaRaia({ raia, tarefasNaRaia, papeis, onPatch })` — Nome; "Quem faz as tarefas desta raia?" (papel, `EntitySelect` de hoje); "N tarefas de usuário nesta raia."
  - `GavetaFase({ fase, formasNaFase, onPatch })` — Nome; prazo em dias úteis (opcional) com a ajuda "Por enquanto é só informativo."
  - `GavetaPiscinaPrincipal({ nome, descricao, quemInicia, orientacao, ... })` — reaproveita `NomeNoTopo`/`SobreDoWorkflow`/`QuemInicia` de hoje + orientação.
  - `GavetaPiscinaExterna({ piscina, onPatch })` — Nome; Quem é? (contratada / fornecedor fixo / órgão ou sistema externo); Como interage? (portal / e-mail com link seguro); texto "Caixa-preta…".
  - `GavetaFormaNova({ forma, workflowsAtivos, onPatch })` — os campos do mockup por variante (temporizador, subprocesso, fim com erro, fim com cancelamento, início agendado/por evento, envio/recebimento, intermediários de mensagem, baseado em evento, embutido, terminar), gravando em `forma.config`; no topo, aviso: "Ainda não executa: dá para desenhar e salvar; para ativar, troque por outro elemento." `workflowsAtivos` vem de `GET /processes?status=ACTIVE` (a lista que "Novo processo" já usa), sem o próprio workflow.
  - `GavetaMensagem({ fluxo, onPatch })` — "O que é enviado?" (rótulo) + de/para.
- [ ] **Step 1: Implement** e ligar no `process-flow.tsx`: `AlvoDaGaveta` → etapa (as 5 perguntas de hoje), seta (`PainelDasSetas`/`EditorDaSeta` de hoje), losangos (o de hoje), e as gavetas novas acima.
- [ ] **Step 2: Verify** tsc + vitest — Expected: PASS.
- [ ] **Step 3: Verify na tela**: duplo clique em cada elemento abre a gaveta certa; editar nome muda o desenho ao vivo; Cancelar desfaz; Aplicar + Salvar + recarregar mantém; tentar Ativar com um temporizador mostra a frase da Task 2 e destaca a forma.
- [ ] **Step 4: Commit** — `"Gavetas de raia, fase, piscinas, fluxo de mensagem e elementos novos"`

### Task 11: Tirar o Roteiro e o "Ver por raia"; topo novo

**Files:**
- Delete: `apps/web/src/components/processes/roteiro/` (6 arquivos)
- Modify: `apps/web/src/lib/roteiro.ts` → manter só o que `process-flow.tsx` ainda usa fora do Roteiro (`secaoDaPendencia`; conferir `contagem`), movido para `apps/web/src/lib/pendencias-do-editor.ts`; apagar `lib/roteiro.ts` e os testes do que saiu, mover os de `secaoDaPendencia`
- Modify: `apps/web/src/components/processes/desenho-bpmn/topo.tsx` (remover `VistaDoEditor`, `SeletorDeVista`, `onVerPorRaia` do `MenuMais`)
- Modify: `apps/web/src/components/processes/process-flow.tsx` (estado `vista` e ramos `noRoteiro`/`raia` saem; somente leitura abre o Desenho em modo leitura)
- Modify: `CHANGELOG.md` ("Não lançado")

**Interfaces:**
- Consumes: `ControlesDoDesenho` (Task 9).
- Produces: o editor abre sempre no Desenho. Topo: nome, versão, desfazer/refazer, `ControlesDoDesenho`, pílula de pendências, Salvar rascunho, Ativar, menu "Mais" (Histórico, Exportar).
- [ ] **Step 1: Implement** a remoção; pendências que levavam ao Roteiro passam a focar a forma no Desenho (`focarPendencia`).
- [ ] **Step 2: Verify** `npx tsc --noEmit -p apps/web`, `npx vitest run` em apps/web, packages/workflow-core e apps/api, e `npm run lint` na raiz — Expected: tudo passa, nenhum import de `roteiro`.
- [ ] **Step 3: Verify na tela** (Review Focus 1): abrir 3 workflows existentes (um ativo, um rascunho, um em somente leitura) — o desenho aparece igual ao de antes, sem aba Roteiro; um workflow ativo sem mudanças continua ativo e dá para iniciar processo nele.
- [ ] **Step 4: CHANGELOG** em "Não lançado", seção do editor: paleta no estilo Bizagi, próximo item, duplo clique, fases, piscinas externas, orientação, raia com executor padrão, Roteiro removido.
- [ ] **Step 5: Commit** — `"Editor só em desenho: sai o Roteiro e o Ver por raia"`
