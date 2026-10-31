# Desenho livre com setas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O editor desenha livremente (apagar qualquer seta, ligar qualquer forma, losangos soltos); o desenho vira a fonte da verdade e os blocos passam a ser derivados por um conversor, que também decide a ativação no servidor.

**Architecture:** Lógica nova no motor (`packages/workflow-core/src/desenho-livre.ts`): `DesenhoV2` (formas + setas + posições + raias), `desenhoParaBlocos` (conversor que aceita/recusa com culpados) e `blocosParaDesenho` (volta preservando ids e posições). A API grava o v2 e converte na ativação. O editor troca o estado `fluxo` por `desenho` v2: `fluxo` vira derivado, e um adaptador `setFluxo(updater)` aplica mudanças de bloco e devolve ao desenho — todas as ações de hoje (Roteiro, painéis) continuam funcionando sem reescrever.

**Tech Stack:** TypeScript, vitest, NestJS (API), Next.js + React + `@xyflow/react` (editor).

**Spec:** `docs/superpowers/specs/2026-10-30-desenho-livre-design.md`

## Global Constraints
- O motor só recebe blocos; o servidor converte o desenho na ativação; nada do navegador é aceito pronto.
- As regras existentes (`validarBlocos`, `validarDesenho`, `validarAtividades`…) continuam valendo, com as mesmas frases; "não chega ao Fim" passa a **erro** (`severidade` sem `'aviso'`) para todos os workflows.
- Workflows existentes abrem **idênticos**; nenhuma migração de banco (tudo em `formSchema`).
- Salvar rascunho sempre funciona; ativar recusa com frase + culpados.
- Um só desfazer; ids iguais em Desenho e Roteiro; ação do Roteiro = um passo.
- Frases do usuário em português, exatamente as da spec §2.
- Branch `feat/desenho-livre` (worktree `C:\sistemas\nxt-roteiro`, a partir de `local/tudo-junto`). Ao fim de cada PR, mesclar em `local/tudo-junto` e rodar `npm run build` em `packages/workflow-core` do worktree principal (a API/testes de lá resolvem pelo `dist`).
- Testes do web: só lógica pura (vitest node). Tela: navegador com a trava (`/api/processes` e `/api/settings` bloqueados) e banco conferido no fim.

## Review Focus
- **Ida e volta com o "Senão" antigo** (seta `padrao` do casoContrario) e com escolha "todos" (`inclusiveGateway`): blocos → desenho → blocos tem de dar igual → testes na Task 4.
- **Id do caminho = id da seta que sai do losango** nas duas direções; sem isso a condição editada no painel do bloco não acha a seta → teste na Task 3 e Task 4.
- **Losango que junta desenhado à mão** (`juntaId`) sobrevive a uma ação do Roteiro (mesmo id e posição) → teste na Task 3.
- **Workflow ativo**: mudar só posições/raias do v2 não volta a rascunho; mudar uma seta volta → teste na Task 7.
- **Desfazer depois de uma ação do Roteiro** volta o desenho inteiro (setas e posições) num passo → verificação no navegador (Task 13).

---

## PR 1 — motor

### Task 1: Tipos e leitura do desenho v2

**Files:**
- Modify: `packages/types/index.ts` (tipos), `packages/workflow-core/index.ts` (export)
- Create: `packages/workflow-core/src/desenho-livre.ts`, `packages/workflow-core/test/desenho-livre.test.ts`

**Interfaces:**
- Produces (`@nxt/types`):
  ```ts
  export type TipoForma = 'start' | 'end' | 'userTask' | 'serviceTask' | 'exclusiveGateway' | 'parallelGateway'
  export interface FormaDesenho { id: string; tipo: TipoForma; nome?: string; modo?: 'primeiro' | 'todos'; pergunta?: string }
  export interface SetaDesenho { id: string; de: string; para: string; condition?: string; conditionSpec?: EdgeConditionSpec; rotulo?: string; padrao?: true }
  export interface DesenhoV2 { versao: 2; formas: FormaDesenho[]; setas: SetaDesenho[]; posicoes: Record<string, { x: number; y: number }>; raias: RaiaDesenho[] }
  ```
  `ProcessFormSchema.desenho?: DesenhoBpmn | DesenhoV2`.
- Produces (`desenho-livre.ts`): `export function lerDesenhoV2(bruto: unknown): DesenhoV2 | null` — valida forma (versão 2, arrays, ids únicos, setas apontando para formas existentes; seta inválida é descartada), como `lerDesenho` faz para v1.

- [ ] **Step 1:** testes `lerDesenhoV2`: válido passa; versão 1 → null; seta com `para` inexistente é descartada; forma duplicada → null.
- [ ] **Step 2:** `cd packages/workflow-core && npx vitest run test/desenho-livre.test.ts` → FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5: Commit** `"Desenho v2: tipos e leitura"`.

### Task 2: `juntaId` nos blocos

**Files:** Modify `packages/workflow-core/src/blocos.ts`, `packages/workflow-core/test/blocos.test.ts`

**Interfaces:** `BlocoEscolha.juntaId?: string`, `BlocoParalelo.juntaId?: string`. `blocosParaGrafo` usa `it.juntaId ?? it.id + SUFIXO_REENCONTRO` para o nó de junção. `lerFluxoBlocos` aceita o campo.

- [ ] **Step 1:** teste: escolha com `juntaId: 'J1'` gera nó `J1` (e não `e1__fim`) e as setas dos caminhos chegam em `J1`; sem `juntaId`, igual a hoje. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suíte do motor inteira PASS. **Step 5: Commit** `"Blocos: juntaId (losango que junta desenhado)"`.

### Task 3: `blocosParaDesenho`

**Files:** Modify `desenho-livre.ts`, `test/desenho-livre.test.ts`

**Interfaces:**
- Consumes: `blocosParaGrafo` (Task 2).
- Produces: `export function blocosParaDesenho(f: FluxoBlocos, anterior?: { posicoes: Record<string, {x:number;y:number}>; raias: RaiaDesenho[] } | null): DesenhoV2`
  - formas = nós de `blocosParaGrafo(f)`; `inclusiveGateway` vira `exclusiveGateway` + `modo: 'todos'` (no losango que divide; no que junta, só o tipo); losango que divide de escolha leva `pergunta`; `modo: 'primeiro'` quando `modoDaEscolha` = primeiro.
  - setas = arestas; **a seta que sai do losango para um caminho ganha `id = caminho.id`** (o caminho vazio também); `condition/conditionSpec/rotulo(label)/padrao(isDefault)` copiados.
  - `posicoes`/`raias` = as de `anterior` para os ids que continuam existindo; formas novas ficam sem posição (o editor completa).

- [ ] **Step 1:** testes: sequência simples (formas/setas certas); escolha "todos" vira `exclusiveGateway` + `modo:'todos'`; ids das setas de caminho = ids dos caminhos; posições preservadas para ids existentes e ausentes para novos; `juntaId` aparece como forma com o mesmo id. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5: Commit** `"Desenho v2: blocos para desenho (ids e posições preservados)"`.

### Task 4: `desenhoParaBlocos` — o que aceita, e ida e volta

**Files:** Modify `desenho-livre.ts`, `test/desenho-livre.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ProblemaDoDesenho { tipo: string; mensagem: string; formas: string[]; setas: string[]; severidade?: 'aviso' }
  export type Conversao = { ok: true; fluxo: FluxoBlocos; avisos: ProblemaDoDesenho[] } | { ok: false; problemas: ProblemaDoDesenho[] }
  export function desenhoParaBlocos(d: DesenhoV2): Conversao
  ```
- Algoritmo (estrutural, a partir do Início): percorre a sequência; numa forma com ≥2 saídas que é losango, monta o bloco: cada saída é um caminho (`caminho.id = seta.id`, condição da seta); acha o ponto de encontro = primeiro nó alcançado por **todos** os caminhos que não terminam (Fim) nem voltam (seta para nó já visitado no percurso), por busca em largura; se é losango do mesmo tipo → `juntaId = id dele`; se é etapa (só escolha) → reencontro implícito (sem `juntaId`); caminho que chega ao Fim → `fim: encerra`; seta para etapa já visitada saindo da última etapa do caminho ou do losango → `fim: { tipo:'volta', alvoId }`. Losango com 1 entrada e 1 saída → passa direto + aviso `losango-sem-efeito`. `modo` vem da forma (`todos` ⇒ escolha "todos"). Escolha monta `casoContrario` vazio que segue (formato atual); seta `padrao` vira o casoContrario (Senão antigo).
- Depois de montar, roda `validarBlocos` e devolve os erros como problemas (com `formas: [itemId]`).

- [ ] **Step 1:** testes de aceitação: sequência; escolha com losango que junta (`juntaId`); escolha com reencontro direto numa etapa; caminho que encerra no Fim; volta saindo da última etapa do caminho; volta saindo do losango (caminho vazio); ao mesmo tempo com losango +; escolha dentro de ao mesmo tempo; losango sem efeito (aviso).
- [ ] **Step 2:** testes de ida e volta `desenhoParaBlocos(blocosParaDesenho(f)).fluxo` deep-equal `f` (com `juntaId` normalizado para `id+SUFIXO` quando ausente no original) para: escolha "primeiro" com 3 caminhos (um vazio), escolha "todos", Senão antigo, etapa vinculada (`vinculoDe` preservado — vinculação vive no bloco: carregar `vinculoDe` na `FormaDesenho` como `vinculoDe?` e voltar), encaixes, e uma réplica sintética do "Solicitação de contratos" (paralelo com etapa + escolha "todos" de 3 caminhos, depois etapa).
  - **Ruling previsto no plano:** `FormaDesenho` ganha `vinculoDe?: string` (necessário para a ida e volta das vinculadas).
- [ ] **Step 3:** FAIL. **Step 4:** implementar. **Step 5:** PASS. **Step 6: Commit** `"Desenho v2: conversor para blocos (aceitos e ida e volta)"`.

### Task 5: `desenhoParaBlocos` — recusas

**Files:** Modify `desenho-livre.ts`, `test/desenho-livre.test.ts`

- [ ] **Step 1:** um teste por recusa, conferindo `mensagem` (frases exatas da spec §2, com o nome da etapa) e `formas`/`setas` culpadas: duas setas saindo de etapa (`tipo:'saidas-multiplas'`); losango + juntando caminhos de escolha (`'juncao-de-escolha'`); ramos de ao mesmo tempo chegando em etapa ou losango × (`'ramos-sem-juncao'`); volta sem decisão (`'volta-sem-decisao'`); caminho que salta o encontro (`'salto-do-encontro'`); erro de `validarBlocos` repassado (ex.: caminho sem condição).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5: Commit** `"Desenho v2: conversor recusa com frase e culpados"`.

### Task 6: "Não chega ao Fim" vira erro

**Files:** Modify `packages/workflow-core/src/activation-guard.ts`, `packages/workflow-core/test/activation-guard.test.ts`

- [ ] **Step 1:** atualizar os testes de `sem-saida`/`nao-alcanca-fim` para esperar severidade de erro (`bloqueantes` os inclui). **Step 2:** FAIL. **Step 3:** remover `severidade: 'aviso'` desses dois e ajustar o comentário (decisão do PO, 30/10/2026). **Step 4:** suíte do motor PASS. **Step 5: Commit** `"Ativação: etapa que não leva ao Fim impede ativar"`. Abrir **PR 1** (base `local/tudo-junto` não existe no GitHub → base `master`, com a dependência #91–#95 escrita no corpo).

---

## PR 2 — API

### Task 7: Gravar e ativar com o desenho v2

**Files:** Modify `apps/api/src/processes/processes.service.ts`; Test `apps/api/src/processes/muda-fluxo.test.ts`, Create `apps/api/src/processes/ativa-desenho-v2.test.ts`

**Interfaces:**
- Consumes: `lerDesenhoV2`, `desenhoParaBlocos` (PR 1).
- Ativação: se `lerDesenhoV2(formSchema.desenho)` → `desenhoParaBlocos`; `!ok` → `BadRequestException` com as frases (uma por linha, como `formatarProblemas`); `ok` → segue o caminho de blocos de hoje usando o `fluxo` convertido (e grava `formSchema.blocos` com ele). Sem v2 → como hoje. `DESENHO_LIVRE_NAO_ATIVA` deixa de ser usado para v2.
- `mudaOFluxo`: `desenho` sai de `CHAVES_SO_VISUAIS`; compara `{ formas, setas }` do v2 (sem `posicoes`/`raias`); v1 continua só visual.

- [ ] **Step 1:** testes `mudaOFluxo`: v2 só com posição/raia diferente → false; v2 com seta diferente → true; v1 só visual → false (como hoje). Testes de ativação (função extraída `blocosDaAtivacao(formSchema): { fluxo } | { erro: string }` para testar sem Nest): v2 convertível → fluxo; v2 que não converte → erro com a frase; só blocos → fluxo.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (extrair `blocosDaAtivacao` para `apps/api/src/processes/blocos-da-ativacao.ts`). **Step 4:** `cd apps/api && npx vitest run` PASS. **Step 5: Commit** `"API: desenho v2 na gravação e na ativação"`. Abrir **PR 2** (depende do PR 1).

---

## PR 3 — editor

### Task 8: Estado do editor sobre o desenho v2

**Files:** Modify `apps/web/src/components/processes/process-flow.tsx`

**Interfaces:**
- Estado: `const [desenho, setDesenho] = useState<DesenhoV2 | null>` (substitui `fluxo` + `desenho` v1 como estado). Abertura: `lerDesenhoV2(initial.desenho) ?? (blocos ? blocosParaDesenho(blocos, lerDesenho(initial.desenho)) : grafo antigo → v2)`.
- Derivados: `conversao = useMemo(() => desenho ? desenhoParaBlocos(desenho) : null)`; `fluxo = conversao?.ok ? conversao.fluxo : null`.
- Adaptador (mantém todas as ações de hoje): `setFluxo(up: (f: FluxoBlocos) => FluxoBlocos)` = `setDesenho(d => { const c = desenhoParaBlocos(d); if (!c.ok) return d; const g = up(c.fluxo); return { ...blocosParaDesenho(g, d) } })`.
- `grafo` passado ao canvas = formas/setas do desenho (não mais `blocosParaGrafo(fluxo)`); `desenhoVisto` = `completarPosicoes` sobre ele.
- Histórico (`historia`): guarda `{ desenho, steps, laneOrder }`. `assinatura` usa o desenho v2.
- `persist`: grava `desenho` v2 (setas que não saem de `exclusiveGateway` vão **sem** `condition/conditionSpec/rotulo` — spec, casos de borda), e `blocos` só quando `conversao.ok`.
- Pendências: `conversao.problemas` (ou `avisos`) entram na lista com `nodeId` = primeira forma culpada; setas culpadas vão num `Set` passado ao canvas para o vermelho tracejado.

- [ ] **Step 1:** implementar. **Step 2: Verificar** `tsc`/`vitest`; navegador (trava): o "Solicitação de contratos" abre idêntico (comparar captura antes/depois nas duas vistas), Roteiro igual, nada "não salvo". **Step 3: Commit** `"Editor: desenho v2 como estado; blocos derivados"`.

### Task 9: Ligar, religar e apagar setas livremente

**Files:** Modify `desenho-bpmn/canvas-bpmn.tsx`, `apps/web/src/lib/desenho-bpmn.ts`, `apps/web/src/lib/desenho-bpmn.test.ts`

**Interfaces:**
- `export function podeLigar(d: DesenhoV2, de: string, para: string): string | null` (lib; `null` = pode; senão a frase): seta para o Início; saindo do Fim; mesma forma; repetida.
- `export function ligar(d, de, para): DesenhoV2`, `religar(d, setaId, novoPara): DesenhoV2`, `apagarSeta(d, setaId): DesenhoV2`, `apagarForma(d, id): DesenhoV2` (leva as setas) — puras, na lib.
- Canvas: `ligacaoPermitida` deixa de ser usada; conexão usa `podeLigar`; `edgesReconnectable` com `onReconnect`; seta selecionável + Delete/"Apagar seta"; callbacks novos para o editor: `onLigar(de, para)`, `onReligar(setaId, para)`, `onApagarSeta(setaId)`.

- [ ] **Step 1:** testes das funções puras (cada recusa de `podeLigar`; `ligar` cria seta com id único; `religar` muda só o destino; `apagarForma` remove setas ligadas). **Step 2:** FAIL. **Step 3:** implementar lib + canvas. **Step 4:** PASS + navegador (trava): apagar a seta entre duas etapas; ligar duas quaisquer; religar a ponta. **Step 5: Commit** `"Desenho: ligar, religar e apagar setas livremente"`.

### Task 10: Paleta com losangos soltos e soltar sobre seta

**Files:** Modify `desenho-bpmn/canvas-bpmn.tsx`, `desenho-bpmn/paleta.tsx`, `lib/desenho-bpmn.ts` (+ teste), `process-flow.tsx`

**Interfaces:**
- `export function soltarForma(d: DesenhoV2, forma: FormaDesenho, posicao: {x:number;y:number}, sobreSeta?: string): DesenhoV2` — com `sobreSeta`: divide a seta (de→nova→para; a condição fica na primeira metade); sem: forma solta.
- Paleta: Escolha e Ao mesmo tempo entram como **um** losango (sem par automático). Inserir pelo **Roteiro** continua criando o par (via `setFluxo` → `blocosParaDesenho`).

- [ ] **Step 1:** testes de `soltarForma` (solta; sobre seta divide e mantém a condição na 1ª metade). **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + navegador. **Step 5: Commit** `"Desenho: losangos soltos e soltar sobre a seta"`.

### Task 11: Condição na seta e no losango

**Files:** Create `desenho-bpmn/painel-da-seta.tsx`; Modify `process-flow.tsx`, `workflow-blocos.tsx`

**Interfaces:**
- Clicar numa seta que sai de `exclusiveGateway` abre `PainelDaSeta` (gaveta) com o construtor de condição atual, gravando `condition/conditionSpec/rotulo` **na seta** (`atualizarSeta(d, setaId, patch)`, pura, na lib, com teste). Outras setas: painel só com "Apagar seta".
- Losango de Escolha: com `conversao.ok`, abre `ConfiguracaoDoBloco` de hoje (os caminhos têm o id da seta — Task 3/4 — então a condição editada lá chega na seta pelo adaptador). Sem conversão: lista das setas que saem com o mesmo editor de condição do `PainelDaSeta`, e pergunta/modo gravados na forma.

- [ ] **Step 1:** teste de `atualizarSeta`. **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + navegador (condição editada na seta aparece no painel do losango e vice-versa). **Step 5: Commit** `"Desenho: condição na seta e no losango"`.

### Task 12: Pendências do conversor na tela

**Files:** Modify `process-flow.tsx`, `desenho-bpmn/canvas-bpmn.tsx`, `desenho-bpmn/formas.tsx`, `flow-shared.tsx` (pílula)

- Pílula: dois grupos — "Desenho incompleto" (solta, inalcançável, não chega ao Fim) e "O motor não executa" (problemas do conversor). Clicar destaca formas (`focoEm`) e setas (vermelho tracejado já existente para recusa).
- [ ] **Step 1:** implementar. **Step 2:** navegador: desenhar cada recusa da spec §2 e ver a frase e o destaque. **Step 3: Commit** `"Desenho: pendências do conversor com destaque"`.

### Task 13: Roteiro com desenho incompleto e verificação final

**Files:** Modify `roteiro/roteiro.tsx`, `process-flow.tsx`

- "Ver por raia" passa a montar o layout direto das formas/setas do desenho (o `layoutGraph` aceita qualquer grafo), então mostra o desenho incompleto como está.
- Com `!conversao.ok`: `avisoDoDesenho` = "O desenho tem N pendências. Termine as ligações no Desenho para ver o roteiro completo" + as pendências clicáveis; `nos` = todas as etapas em ordem de `posicoes` (x, depois y) como etapas soltas na raiz; `estrutura` ausente (bloqueada) com o motivo no lugar do "+".
- [ ] **Step 1:** implementar. **Step 2: Verificar** tudo: `cd apps/web && npx tsc --noEmit -p . && npx vitest run`; `cd packages/workflow-core && npx vitest run`; `cd apps/api && npx vitest run`. **Step 3:** navegador (trava, roteiro da spec "Testes"): abre idêntico; apagar/criar/religar; soltar sobre seta; pendências e aviso no Roteiro; consertar e ver o Roteiro voltar; desfazer após ação do Roteiro (um passo); banco conferido. **Step 4: Commit** `"Roteiro: aviso e etapas configuráveis com o desenho incompleto"`, mesclar em `local/tudo-junto`, rebuild do `workflow-core` do worktree principal, abrir **PR 3** (depende dos PRs 1 e 2).
