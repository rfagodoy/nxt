# Editor de workflow em desenho BPMN — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o editor de workflow (trilho "Montar" + vista por raia) por um desenho BPMN estilo Bizagi — formas livres, raias visuais, paleta, setas validadas e gaveta de perguntas — sem mudar o motor nem o banco.

**Architecture:** `FluxoBlocos` continua a fonte da verdade; o desenho é uma projeção de `blocosParaGrafo(fluxo)` + posições gravadas em `formSchema.desenho`. Toda edição estrutural vira uma operação de blocos que já existe (`inserirItem`, `moverItem`, `removerItem`, `atualizarCaminho`); as regras novas (onde soltar, que seta pode existir) são funções puras testadas no `@nxt/workflow-core` e em `apps/web/src/lib/desenho-bpmn.ts`. O canvas é React Flow com formas próprias na identidade Nxt.

**Tech Stack:** Next.js 15 / React 19, `@xyflow/react` (novo, MIT), Tailwind, Vitest; NestJS sem mudança.

**Spec:** `docs/superpowers/specs/2026-10-27-editor-bpmn-design.md` (mockups: https://claude.ai/artifact/992ebjPWc4E7jFLKUnEwZ2, linha "Desenho BPMN no estilo Bizagi").

**Base:** branch `feat/editor-bpmn`, criado a partir de `feat/etapa-por-perguntas` (PR #86) — a gaveta reaproveita o modal de perguntas. Mesclar #86 antes deste PR.

## Global Constraints

- Paleta só com: **Tarefa** (`userTask`), **Automática** (`serviceTask`), **Escolha**, **Ao mesmo tempo**, **Raia**. Sem "Fim" na paleta (Início e Fim são únicos e já existem).
- Raias são **só visuais**; nunca alteram `executor`. Divergência gera só o aviso de `avisoDeRaia`.
- Soltar Escolha / Ao mesmo tempo cria divisão + reencontro (já é o que `novoItem` + `blocosParaGrafo` fazem).
- Posição livre gravada em `formSchema.desenho` (`versao: 1`); "Organizar" recalcula. Sem `desenho`, o workflow abre via `desenhoInicial`.
- Lista de etapas (trilho `BlocosTrilho`) **sai**.
- Topo numa linha: voltar · nome · Sobre · Quem inicia · saúde (`PendenciasPill`) · desfazer/refazer · **Organizar** · **⋯** (Histórico, Exportar, Ver por raia) · Salvar rascunho · Ativar workflow.
- Cores: tarefa azul (`#075985` / `#7DD3FC` no escuro), escolha violeta (`#5B21B6` / `#C4B5FD`), ao mesmo tempo rosa (`#9F1239` / `#FDA4B8`), seleção Esmeralda `#11804F` + anel Lima no claro e Lima `#C6F24E` no escuro, recusa `#D64535`. Fontes Manrope / Space Mono. Campos da gaveta em `h-[var(--campo-altura)] text-[length:var(--campo-fonte)]`.
- Textos de recusa exatamente como em `MSG_*` (Task 2).
- Nenhuma migração de banco; `formSchema` segue `Record<string, unknown>` na API.

## Review Focus

1. **Workflow salvo sem `desenho`** (todos os de hoje) abre organizado, com raias sugeridas, e ao salvar e reabrir as posições se mantêm — teste em Task 3 (`desenhoInicial`) e roteiro manual em Task 9.
2. **Posições órfãs** depois de remover um bloco (o reencontro some junto) não podem ir para a gravação — teste `podarDesenho` em Task 1 e chamada no `persist` (Task 8).
3. **Soltar numa seta dentro de "ao mesmo tempo" ou logo após um reencontro** insere na lista certa; seta de volta / encerrar não aceita soltura — testes de `pontoDaSeta` em Task 1.
4. **Desfazer depois de mover uma forma** devolve a posição (o desenho entra no `Retrato` do histórico) — teste manual em Task 8, passo explícito.
5. **Workflow antigo que não cabe em blocos** (`fluxo === null`) continua abrindo só leitura na vista por raia — passo explícito em Task 8.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `packages/types/index.ts` | tipos `DesenhoBpmn`, `RaiaDesenho`; `ProcessFormSchema.desenho` |
| `packages/workflow-core/src/desenho.ts` (novo) | regras puras: `lerDesenho`, `podarDesenho`, `pontoDaSeta`, `ligacaoPermitida`, `MSG_*` |
| `packages/workflow-core/test/desenho.test.ts` (novo) | testes das regras |
| `apps/web/src/lib/desenho-bpmn.ts` (novo) | geometria pura: `desenhoInicial`, `organizar`, `completarPosicoes`, `raiaNaAltura`, `avisoDeRaia`, `setaSobPonto` |
| `apps/web/src/lib/desenho-bpmn.test.ts` (novo) | testes da geometria |
| `apps/web/src/components/processes/desenho-bpmn/formas.tsx` (novo) | formas React Flow: tarefa, losango, evento, raia; seta com rótulo |
| `apps/web/src/components/processes/desenho-bpmn/canvas-bpmn.tsx` (novo) | o canvas: projeção, seleção, mover, soltar, ligar, ações rápidas, minimapa, zoom |
| `apps/web/src/components/processes/desenho-bpmn/paleta.tsx` (novo) | paleta arrastável |
| `apps/web/src/components/processes/desenho-bpmn/gaveta.tsx` (novo) | contêiner da gaveta lateral |
| `apps/web/src/components/processes/process-flow.tsx` | integra: topo, histórico, gravação, gaveta; o modal vira conteúdo da gaveta |
| `apps/web/src/components/processes/workflow-blocos.tsx` | sai `BlocosTrilho`; entra `ConfiguracaoDoBloco` (caminhos da escolha / frentes na gaveta) |

---

### Task 1: Tipos do desenho e regras de inserção (`@nxt/types`, `workflow-core`)

**Files:**
- Modify: `packages/types/index.ts` (junto de `ProcessFormSchema`, ~l.283)
- Create: `packages/workflow-core/src/desenho.ts`; export em `packages/workflow-core/index.ts`
- Test: `packages/workflow-core/test/desenho.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // @nxt/types
  export interface RaiaDesenho { id: string; nome: string; altura: number }
  export interface DesenhoBpmn { versao: 1; posicoes: Record<string, { x: number; y: number }>; raias: RaiaDesenho[] }
  // ProcessFormSchema ganha: desenho?: DesenhoBpmn
  // @nxt/workflow-core
  export interface PontoDeInsercao { ref: string; indice: number }
  export function lerDesenho(bruto: unknown): DesenhoBpmn | null
  export function podarDesenho(d: DesenhoBpmn, idsDosNos: Iterable<string>): DesenhoBpmn
  export function pontoDaSeta(f: FluxoBlocos, de: string, para: string): PontoDeInsercao | null
  ```

- [ ] **Step 1: Escrever os testes**

`lerDesenho`: aceita `{versao:1, posicoes:{a:{x:1,y:2}}, raias:[{id:'r1',nome:'RH',altura:140}]}`; recusa (`null`) `versao:2`, posição com `NaN`, raia com `altura < 60`, `raias` ausente.
`podarDesenho`: com posições `a,b,c` e ids `['a','c']` sobra `{a,c}`; raias intactas.
`pontoDaSeta` — fluxo `raiz=[A, E(escolha modo 'todos', caminhos c1=[X], c2=[]), P(paralelo, frentes f1=[Y], f2=[Z]), B]`, `inicioId='start'`, `fimId='end'`:
- `('start','A')` → `{ref:'raiz',indice:0}`; `('A','E')` → `{raiz,1}`
- `('E','X')` → `{c1,0}`; `('X','E__fim')` → `{c1,1}`; `('E','E__fim')` → `{c2,0}` (caminho vazio)
- `('E__fim','P')` → `{raiz,2}`; `('P','Y')` → `{f1,0}`; `('Y','P__fim')` → `{f1,1}`
- `('P__fim','B')` → `{raiz,3}`; `('B','end')` → `{raiz,4}`
- `('X','A')` (volta) → `null`; `('nada','B')` → `null`

- [ ] **Step 2: Rodar e ver falhar** — `cd packages/workflow-core && npx vitest run test/desenho.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar** os tipos e as três funções. `pontoDaSeta` percorre as listas como `listas()` em `blocos.ts` e, para cada lista com origem `o` e destino `d`, compara as vagas `k = 0..n`: `de = k===0 ? o : saida(itens[k-1])`, `para = k===n ? d : itens[k].id`. Origem/destino: raiz `inicioId → fimId`; caminho de escolha `escolha.id → escolha.id + SUFIXO_REENCONTRO`; frente de paralelo `paralelo.id → paralelo.id + SUFIXO_REENCONTRO`. `saida(item)` = `item.id` para atividade, `item.id + SUFIXO_REENCONTRO` para bloco. (Escolha "primeiro" com ≤ 1 caminho que segue não gera reencontro: aí as vagas finais simplesmente não casam e a seta não aceita soltura — aceitável.)

- [ ] **Step 4: Rodar e ver passar** — mesmo comando → PASS; depois `npx vitest run` no pacote inteiro → tudo verde.

- [ ] **Step 5: Commit** — `git add packages/types/index.ts packages/workflow-core && git commit -m "Desenho BPMN: tipos e regra de onde soltar (pontoDaSeta)"`

### Task 2: Que seta pode ser desenhada (`ligacaoPermitida`)

**Files:**
- Modify: `packages/workflow-core/src/desenho.ts`
- Test: `packages/workflow-core/test/desenho.test.ts`

**Interfaces:**
- Consumes: `destinosDeVolta`, `listarEscolhas`, `FimCaminho` de `blocos.ts`.
- Produces:
  ```ts
  export type Ligacao = { ok: true; caminhoId: string; fim: FimCaminho } | { ok: false; motivo: string }
  export function ligacaoPermitida(f: FluxoBlocos, de: string, para: string): Ligacao
  export const MSG_LOSANGO = 'Uma volta só pode apontar para uma tarefa — voltar para um losango trava o processo.'
  export const MSG_PARALELO = 'Dentro de “ao mesmo tempo” não dá para voltar nem encerrar: as outras frentes continuariam rodando.'
  export const MSG_ORDEM = 'As setas seguem a ordem das etapas. Para mudar a ordem, arraste a etapa para cima de outra seta.'
  export const MSG_DESTINO = 'Só dá para voltar para uma tarefa que vem antes desta escolha e fora de “ao mesmo tempo”.'
  ```

- [ ] **Step 1: Testes** — fluxo `raiz=[A, E(caminhos c1=[X]), B]`:
  - `('X','A')` → `{ok:true, caminhoId:'c1', fim:{tipo:'volta',alvoId:'A'}}`
  - `('X','end')` → `{ok:true, caminhoId:'c1', fim:{tipo:'encerra'}}`
  - `('X','E')` e `('X','E__fim')` → `{ok:false, motivo: MSG_LOSANGO}`
  - `('X','B')` (depois da escolha) → `MSG_DESTINO`; `('A','B')` (A não fecha caminho) → `MSG_ORDEM`
  - mesma escolha dentro de uma frente de paralelo: `('X','A')` → `MSG_PARALELO`
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** Origem válida = última atividade de um caminho (não o caso contrário) de alguma escolha; escolha dentro de paralelo → `MSG_PARALELO`; `para === f.fimId` → encerra; `para` ∈ `destinosDeVolta(f, escolha.id)` → volta; `para` é id de escolha/paralelo ou termina com `SUFIXO_REENCONTRO` → `MSG_LOSANGO`; senão `MSG_DESTINO`.
- [ ] **Step 4: Rodar e ver passar** (pacote inteiro).
- [ ] **Step 5: Commit** — `"Desenho BPMN: regra das setas desenhadas à mão (ligacaoPermitida)"`

### Task 3: Geometria pura do desenho (`apps/web/src/lib/desenho-bpmn.ts`)

**Files:**
- Create: `apps/web/src/lib/desenho-bpmn.ts`, `apps/web/src/lib/desenho-bpmn.test.ts`

**Interfaces:**
- Consumes: `layoutGraph`, `LANE_SEM_RESPONSAVEL` de `@/lib/flow-layout`; `GrafoGerado` de `@nxt/workflow-core`; `DesenhoBpmn` de `@nxt/types`.
- Produces:
  ```ts
  export const GRADE = 16
  export const RAIA_ALTURA_PADRAO = 140
  export const RAIA_ROTULO_W = 120
  export function desenhoInicial(g: GrafoGerado, responsavelDe: (id: string) => string | undefined): DesenhoBpmn
  export function organizar(g: GrafoGerado, d: DesenhoBpmn, responsavelDe: (id: string) => string | undefined): DesenhoBpmn
  export function completarPosicoes(g: GrafoGerado, d: DesenhoBpmn, perto?: { x: number; y: number }): DesenhoBpmn
  export function raiaNaAltura(raias: RaiaDesenho[], y: number): number      // índice ou -1
  export function avisoDeRaia(nomeRaia: string, responsavel: string | undefined): string | null
  export function setaSobPonto(setas: Array<{ id: string; pontos: Array<{ x: number; y: number }> }>, p: { x: number; y: number }, tolerancia?: number): string | null
  ```

- [ ] **Step 1: Testes**
  - `desenhoInicial`: grafo `start→A→B→end`, A com responsável "RH", B "Contas" → 2 raias `['RH','Contas']`, toda id tem posição, `raiaNaAltura(raias, pos.A.y)` = 0 e de B = 1; sem responsável vira raia de nome `''`.
  - `organizar`: com A já dentro da raia 1, continua na raia 1; em `start→A→B→C→end`, `x` cresce estritamente; posições múltiplas de `GRADE`.
  - `completarPosicoes`: falta só `N` (sucessor de A) → `N.x = A.x + 200`, `N.y = A.y`; com `perto={x:333,y:107}` o primeiro que falta vai para `{x:336,y:112}` (encaixe na grade).
  - `raiaNaAltura([{altura:140},{altura:100}], 139)` = 0, `140` = 1, `240` = -1, `-1` = -1.
  - `avisoDeRaia('RH','Analista de RH')` → `null`; `('Patrimônio','Analista de Patrimonio')` → `null` (sem acento); `('RH','Analista de Fluxo de Contas')` → `'Está na raia “RH”, mas quem executa é Analista de Fluxo de Contas.'`; `('', 'X')` → `null`; `('RH', undefined)` → `null`.
  - `setaSobPonto`: seta `[{0,0},{100,0}]`, ponto `{50,10}` → id; `{50,20}` → `null`.
- [ ] **Step 2: Rodar e ver falhar** — `cd apps/web && npx vitest run src/lib/desenho-bpmn.test.ts`.
- [ ] **Step 3: Implementar.** `desenhoInicial` usa `layoutGraph(grafo, undefined, { swimlanes: true })` com `lane = responsavelDe(id) ?? LANE_SEM_RESPONSAVEL`; raias vêm de `result.lanes` (`id: 'raia_'+i`, `nome` vazio para `LANE_SEM_RESPONSAVEL`, `altura: max(band.h, RAIA_ALTURA_PADRAO)`), posições recalculadas para que `y` caia dentro da faixa acumulada da raia. `organizar` usa o `x` de `layoutGraph` sem raias e centraliza cada nó na raia em que já está (ou na sugerida por `responsavelDe`, se não tiver posição). Tudo arredondado para `GRADE`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `"Desenho BPMN: geometria (inicial, organizar, raias, aviso, seta sob o ponto)"`

### Task 4: Formas e canvas somente leitura (React Flow)

**Files:**
- Modify: `apps/web/package.json` (dep `@xyflow/react`)
- Create: `desenho-bpmn/formas.tsx`, `desenho-bpmn/canvas-bpmn.tsx`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  export interface CanvasBpmnProps {
    fluxo: FluxoBlocos; grafo: GrafoGerado; desenho: DesenhoBpmn
    steps: Record<string, StepFormSchema>
    selecionado: string | null
    somenteLeitura?: boolean
    responsavelDe: (id: string) => string | undefined   // "Analista de Central de Contratos"
    prazoDe: (id: string) => string | null               // dueText
    problemasDe: (id: string) => string[]                // mensagens de validação do nó
    onSelecionar: (id: string | null) => void
    onDesenho: (d: DesenhoBpmn) => void
    onInserir: (ponto: PontoDeInsercao, tipo: NovoItem, perto: { x: number; y: number }) => void
    onMoverItem: (id: string, ponto: PontoDeInsercao) => void
    onLigar: (caminhoId: string, fim: FimCaminho) => void
    onRemover: (id: string) => void
  }
  export function CanvasBpmn(props: CanvasBpmnProps): JSX.Element
  ```

- [ ] **Step 1:** `cd apps/web && npm i @xyflow/react` (versão estável atual, fixa no `package.json`); importar `@xyflow/react/dist/style.css` só no `canvas-bpmn.tsx`.
- [ ] **Step 2: Formas** em `formas.tsx`, como no mockup: tarefa 150×64 (nome em 2 linhas + "papel · prazo"; ícone ⚙ na automática), losango 40 girado (✕ escolha, + paralelo, ○ reencontro inclusivo), círculos Início (2px) / Fim (4px), raia como nó de fundo (`zIndex -1`, não arrastável, rótulo à esquerda em `RAIA_ROTULO_W`), seta ortogonal (`smoothstep`, cantos 0) com rótulo em pílula (condição do caminho, "senão"). Marca de problema (ponto âmbar + `title`) quando `problemasDe(id)` ou `avisoDeRaia(...)` não for vazio. Cores das Global Constraints, claro e escuro via `dark:`.
- [ ] **Step 3: Canvas** projeta `grafo` + `desenho` em nós/arestas do React Flow, com grade de pontos (`Background variant=dots gap=GRADE`), `MiniMap`, `Controls` (zoom), `fitView` na abertura, `snapToGrid`, seleção por clique (`onSelecionar`), e `onNodeDragStop` → `onDesenho` com a nova posição. `somenteLeitura` desliga arrastar e conectar.
- [ ] **Step 4: Verificar** — `npx tsc --noEmit -p .` e `npx next lint --file` nos arquivos novos limpos.
- [ ] **Step 5: Commit** — `"Desenho BPMN: formas na identidade Nxt e canvas React Flow"`

### Task 5: Paleta, soltar, reordenar, ações rápidas e setas validadas

**Files:**
- Create: `desenho-bpmn/paleta.tsx`
- Modify: `desenho-bpmn/canvas-bpmn.tsx`

**Interfaces:**
- Consumes: `pontoDaSeta`, `ligacaoPermitida`, `MSG_ORDEM`, `setaSobPonto`, `completarPosicoes`, `NovoItem`.
- Produces: `export function PaletaBpmn({ onAdicionarRaia }: { onAdicionarRaia: () => void }): JSX.Element` — itens arrastáveis com `dataTransfer` `'application/nxt-forma'` = `'userTask' | 'serviceTask' | 'escolha' | 'paralelo'`; "Raia" é clique (`onAdicionarRaia`). Rótulos: Selecionar, Tarefa, Automática, Escolha, Ao mesmo tempo, Raia.

- [ ] **Step 1: Soltar da paleta** — `onDrop`: posição via `screenToFlowPosition`; se `setaSobPonto` acha uma seta e `pontoDaSeta` dá ponto → `onInserir(ponto, tipo, posicao)`; em área vazia → `onInserir({ref:'raiz', indice: fluxo.itens.length}, tipo, posicao)`. Durante o arrasto, a seta sob o ponteiro fica destacada (Esmeralda / Lima).
- [ ] **Step 2: Reordenar** — arrastar uma forma de atividade/bloco e soltar sobre uma seta com ponto → `onMoverItem(id, ponto)`; fora de seta só muda a posição.
- [ ] **Step 3: Setas à mão** — alças nas 4 laterais da tarefa; `isValidConnection` / `onConnect` chamam `ligacaoPermitida`; ok → `onLigar(caminhoId, fim)`; recusa → seta tracejada `#D64535` e alerta `role="alert"` com o `motivo`, que some em 4 s ou ao clicar.
- [ ] **Step 4: Ações rápidas** (`NodeToolbar` na forma selecionada): "Próxima: tarefa" e "Próxima: escolha" (inserem logo depois do item: `{ref: lista do item, indice: posição+1}`), "Ligar com seta" (só quando o item fecha caminho de escolha), "Excluir" (`onRemover`).
- [ ] **Step 5: Verificar manualmente** (Task 9 detalha): soltar Tarefa numa seta da raiz, numa seta dentro de frente e em área vazia; soltar Escolha cria divisão + reencontro; arrastar seta de volta para um losango mostra `MSG_LOSANGO`. `tsc` + lint limpos.
- [ ] **Step 6: Commit** — `"Desenho BPMN: paleta, soltar na seta, reordenar e setas validadas"`

### Task 6: Raias visuais

**Files:**
- Modify: `desenho-bpmn/formas.tsx`, `desenho-bpmn/canvas-bpmn.tsx`

- [ ] **Step 1:** Piscina com o nome do workflow na faixa vertical; raias empilhadas na ordem de `desenho.raias`; largura = maior `x + largura` das formas + 160.
- [ ] **Step 2:** Rótulo da raia editável com duplo clique (Enter grava, Esc cancela); alça inferior muda a `altura` (mínimo 60, passo `GRADE`); menu da raia: "Subir", "Descer", "Remover raia" (formas ficam onde estão). "+ raia" ao pé da piscina e o item "Raia" da paleta acrescentam `{ id, nome: 'Nova raia', altura: RAIA_ALTURA_PADRAO }`.
- [ ] **Step 3:** Aviso discreto na tarefa via `avisoDeRaia(raias[raiaNaAltura(...)].nome, responsavelDe(id))` — já desenhado pela marca da Task 4.
- [ ] **Step 4:** `tsc` + lint; conferência manual (renomear, redimensionar, remover).
- [ ] **Step 5: Commit** — `"Desenho BPMN: raias visuais editáveis e aviso de raia × responsável"`

### Task 7: Gaveta lateral (perguntas da etapa e configuração da escolha/paralelo)

**Files:**
- Create: `desenho-bpmn/gaveta.tsx`
- Modify: `process-flow.tsx` (o `ActivityConfigModal` vira `PerguntasDaEtapa` + contêiner), `workflow-blocos.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function GavetaLateral({ titulo, rotulo, onFechar, rodape, children }: {
    titulo: string; rotulo: string; onFechar: () => void; rodape?: React.ReactNode; children: React.ReactNode }): JSX.Element  // 440px, à direita, sem fundo escuro
  export function ConfiguracaoDoBloco(props: TrilhoProps & { blocoId: string }): JSX.Element  // workflow-blocos.tsx
  ```
- [ ] **Step 1:** Separar do `ActivityConfigModal` o conteúdo (perguntas, "Em resumo", índice, rodapé com Cancelar/Aplicar e snapshot de cancelamento) num componente `PerguntasDaEtapa` com as mesmas props; o modal deixa de existir e a gaveta o hospeda (Esc = cancelar, como hoje). Coluna única: o "Em resumo" vai para o topo, o índice de perguntas sai (cabe em 440 px).
- [ ] **Step 2:** `ConfiguracaoDoBloco` reaproveita `BlocoEscolhaView` / `BlocoParaleloView` sob o mesmo `Ctx`, com uma flag `soConfiguracao` que não renderiza as `Sequencia` aninhadas (as etapas estão no desenho): pergunta da decisão, modo "acontecem todos / só o primeiro", caminhos com `CondicaoNaFrase`, `FimSelect`, "Testar escolha", adicionar/remover/mover caminho; no paralelo, frentes (adicionar/remover) e nome.
- [ ] **Step 3:** Remover `BlocosTrilho` e o que só ele usa (`Vaga`, `MenuInserir`, `Minimapa`, `Gaveta`, `CartaoAtividade`, `useArrastoPelaAlca`, `Evento`, `Sequencia`/`ItemDoTrilho` se ficarem sem uso, `PREF_*`); o lint (`no-unused-vars`) confirma o que sobrou.
- [ ] **Step 4:** `tsc`, lint e `npx vitest run` (web 220+) verdes.
- [ ] **Step 5: Commit** — `"Desenho BPMN: gaveta lateral com as perguntas e a configuração da escolha"`

### Task 8: Integração no editor

**Files:**
- Modify: `apps/web/src/components/processes/process-flow.tsx`

- [ ] **Step 1: Estado e histórico** — novo estado `desenho: DesenhoBpmn`; `Retrato` ganha `desenho`; o efeito que registra retratos e o `irPara` passam a incluí-lo. Abertura: `lerDesenho(initial.formSchema.desenho)` ou `desenhoInicial(blocosParaGrafo(fluxo), responsavelDe)`. Depois de toda mudança de `fluxo`, `completarPosicoes` dá lugar às formas novas (o `perto` vem do `onInserir`).
- [ ] **Step 2: Handlers** — `onInserir` reusa o `inserir` existente (passos novos inclusive); `onMoverItem` → `moverItem`; `onLigar` → `atualizarCaminho(f, caminhoId, { fim })`; `onRemover` → `remover`; "Organizar" → `organizar(...)`.
- [ ] **Step 3: Gravação** — `persist` inclui `desenho: podarDesenho(desenho, grafo.nodes.map(n => n.id))` no `formSchema`.
- [ ] **Step 4: Topo** numa linha (Global Constraints); "Montar | Ver por raia" sai; ⋯ abre menu com Histórico, Exportar (menu atual) e "Ver por raia" (abre o `FlowCanvas` atual em modo leitura, com "Voltar ao desenho"). `ActivitySummaryPanel` sai. Clique numa tarefa abre a gaveta de perguntas; em escolha/paralelo, `ConfiguracaoDoBloco`.
- [ ] **Step 5: Legado** — com `fluxo === null` (desenho que não cabe em blocos) a tela continua como hoje: vista por raia só leitura.
- [ ] **Step 6: Verificar** — `tsc`, lint, web tests; manual: mover uma forma e **Ctrl+Z devolve a posição**; abrir "Solicitação de contratos" (sem `desenho`) mostra raias sugeridas; salvar, recarregar, posições mantidas.
- [ ] **Step 7: Commit** — `"Editor de workflow em desenho BPMN: integração, gravação do desenho e topo novo"`

### Task 9: Verificação final e PR

- [ ] **Step 1:** `npm run test` na raiz (workflow-core, API, web) e `npx tsc --noEmit` em web e API — tudo verde.
- [ ] **Step 2: Roteiro no navegador** (1440×900, 1366×768, claro e escuro, densidade compacta e alta): abrir workflow antigo; criar do zero (Início → Tarefa → Escolha com 2 caminhos → Fim); volta válida e recusada (losango, dentro de paralelo); Organizar; raias (criar, renomear, redimensionar, remover) e aviso de raia; gaveta (Cancelar desfaz, Esc); Salvar → recarregar → igual; Ativar com pendência mostra o selo; "Ver por raia" no ⋯.
- [ ] **Step 3:** Revisão do branch inteiro (superpowers:requesting-code-review).
- [ ] **Step 4:** Push e PR único para `master` com resumo, link do mockup, provas (testes + roteiro) e a nota "depende do #86".
