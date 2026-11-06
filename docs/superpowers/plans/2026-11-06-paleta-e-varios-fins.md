# Paleta enxuta e vários Fins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A paleta do editor de workflow só oferece o que funciona, cada caminho pode terminar no seu próprio Fim, e o aviso de raia só aparece quando há divergência real.

**Architecture:** O desenho v2 continua sendo a fonte da verdade. Os vários Fins se resolvem na conversão: `desenhoParaBlocos` enxerga todos como um só, e `blocosParaDesenho` os devolve ao desenho; blocos, grafo, interpretador, API e banco não mudam. Paleta, gavetas e aviso de raia são mudanças só na web.

**Tech Stack:** TypeScript, Next.js + React, @xyflow/react, vitest (web e workflow-core).

**Spec:** `docs/superpowers/specs/2026-11-03-editor-bizagi-design.md`, seção "Revisão de 06/11/2026". O restante da spec é histórico.

## Global Constraints

- Sem migração de banco. Sem mudança em `FluxoBlocos`, `WfGraph`, interpretador ou API.
- Desenho gravado com item removido abre, salva em rascunho e **não** ativa; a configuração gravada é preservada.
- Workflow de um Fim gera os mesmos blocos e o mesmo grafo de antes.
- Frases fixas:
  - Recusa de item removido: `"<nome>" é <rótulo>, que não executa. Troque por outro elemento ou deixe o workflow em rascunho.`
  - Fim sem seta: `O Fim "<nome>" não recebe nenhuma seta. Ligue um caminho a ele ou apague-o.`
  - Aviso de raia: `Está na raia “<raia>”, cujo executor padrão é <papel da raia>, mas quem executa é <responsável>.`
  - Gaveta de item removido: `Este elemento não executa. Para ativar o workflow, troque-o por outro ou remova-o.`
- Nenhum texto promete entrega futura: somem "Próxima rodada", "Executa hoje" e "próxima entrega".
- `CHANGELOG.md`: só em "Não lançado"; a entrada 2.0.0 não muda. Sem número de versão nem tag (`docs/versionamento.md`).
- `packages/workflow-core`: depois de mudar `src/`, rodar `npm run build -w @nxt/workflow-core`, porque a API lê o `dist`.
- Branch: `editor-paleta-varios-fins`, a partir da `master`. A spec revisada e este plano entram no primeiro commit.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Editar a condição de uma Escolha com dois Fins pela gaveta (`atributosNoDesenho`) mantém os dois Fins e as setas → teste na Task 1.
2. Remover um caminho, ou outra ação estrutural pelos blocos, não apaga nem funde os outros Fins; o Fim que perdeu a seta vira pendência → teste na Task 1.
3. Apagar o primeiro Fim de um workflow ativo, sem mudar o que executa, não o devolve a rascunho → teste na Task 1.
4. Escolha ligada direto a dois Fins, sem etapa no meio: as duas setas viram a mesma origem e destino depois de unificadas, e cada condição ainda precisa concluir o processo → teste na Task 1.
5. Índice de variação antigo (`escolhidas`) ou arrasto `{ grupo: 'fim', indice: 1 }` depois da limpeza não quebra: o arrasto é recusado e o índice cai no último item → teste na Task 3.

---

### Task 1: Vários Fins na conversão

**Files:**
- Modify: `packages/workflow-core/src/desenho-livre.ts` (`desenhoParaBlocos`, linhas 375-419; `blocosParaDesenho`, linhas 148-233)
- Modify: `packages/workflow-core/src/o-que-executa.ts` (`normalizarFluxo`)
- Modify: `apps/web/src/lib/desenho-bpmn.ts:495` (só o comentário de `apagarForma`: "um Início a mais se apaga; o último Início ou Fim, não")
- Create: `packages/workflow-core/test/desenho-varios-fins.test.ts`
- Modify: `packages/workflow-core/test/desenho-livre-recusas.test.ts:74-80` (a recusa de dois Fins sai; os dois Inícios ficam)

**Interfaces:**
- Produces: `desenhoParaBlocos` aceita vários Fins simples; `fluxo.fimId` é sempre o primeiro Fim de `d.formas`.
- Produces: problema `{ tipo: 'fim-sem-seta', mensagem, formas: [id], setas: [] }`.

- [ ] **Step 1: Criar a branch e commitar a spec revisada e este plano**

Run: `git switch -c editor-paleta-varios-fins`, depois `git add` dos dois documentos e commit `Spec e plano: paleta enxuta e vários Fins`.

- [ ] **Step 2: Escrever os testes que falham** em `desenho-varios-fins.test.ts`, com os helpers `F`, `S` e `desenho` de `desenho-livre-recusas.test.ts`:

```ts
it('Escolha com um Fim por caminho converte, com fimId no primeiro Fim')
  // start → e; e → a1 (condição x) → end; e → a2 (padrão) → end2
  // ok === true; fluxo.fimId === 'end'
it('Escolha ligada direto a dois Fins converte e conclui por qualquer caminho')
  // e → end (condição), e → end2 (padrão). Compilar com blocosParaGrafo e rodar no interpretador,
  // como em test/ do interpretador: cada valor da condição termina em status 'completed'
it('três Fins convertem')
it('um Fim gera exatamente os mesmos blocos de antes')
it('ramo de Ao mesmo tempo indo a um segundo Fim continua recusado')
  // p → a1 → end; p → a2 → end2: o mesmo tipo de recusa de p → a1 → end; p → a2 → end
it('Fim sem seta, com mais de um Fim, vira pendência com a frase e a forma')
  expect(p).toEqual({ tipo: 'fim-sem-seta', mensagem: 'O Fim "Recusado" não recebe nenhuma seta. Ligue um caminho a ele ou apague-o.', formas: ['end2'], setas: [] })
it('Fim com variante removida continua recusado pela frase de não executa')
  // F('end2', 'end', { variante: 'erro', nome: 'Falhou' })
  expect(p.mensagem).toBe('"Falhou" é um fim com erro, que não executa. Troque por outro elemento ou deixe o workflow em rascunho.')
it('atributosNoDesenho numa Escolha com dois Fins mantém formas e setas')
it('blocosParaDesenho depois de ação estrutural devolve as setas aos Fins de antes')
  // retirar um item da Escolha pelos blocos: as setas seguem para end e end2
it('caminho removido deixa o Fim dele no desenho, e a conversão aponta fim-sem-seta')
it('a posição e o nome do Fim preservado continuam')
it('assinaturaDoQueExecuta não muda ao apagar o primeiro Fim nem ao trocar o Fim de uma seta')
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test -w @nxt/workflow-core -- desenho-varios-fins`
Expected: FAIL, com a recusa `inicio-fim`.

- [ ] **Step 4: Implementar em `desenhoParaBlocos`**

Depois da recusa de itens que não executam e da checagem de Início/Fim: sair a recusa de vários Fins; se houver mais de um Fim, os que não têm seta chegando geram `fim-sem-seta` (todos, numa só resposta); depois, um `const unificado = { ...d, formas: sem os Fins extras, setas: com para = fins[0].id }` alimenta o resto da função. Os ids das setas não mudam, para os culpados continuarem certos. Ajustar a frase de `naoExecutam` (sem "ainda"). O `tipo` `ainda-nao-executa` continua.

- [ ] **Step 5: Implementar em `blocosParaDesenho`**

Com `anterior.formas` tendo mais de um Fim: as formas `end` que não vieram do grafo voltam ao fim de `formas`, com posição, nome e layout; cada seta nova com `para === f.fimId` procura no `anterior.setas` uma seta que chegava a um Fim com o mesmo `id` e, se não houver, com o mesmo `de`, e herda o `para`. Sem correspondência, fica no Fim principal. `vivos` precisa enxergar os Fins preservados, senão a posição e os tamanhos deles somem. `manterPassagens` e as pontas livres continuam funcionando sobre o resultado. Com um Fim só, nenhum passo novo roda.

- [ ] **Step 6: Tirar `fimId` em `normalizarFluxo`** e ajustar o comentário de `apagarForma`.

- [ ] **Step 7: Rodar a suíte inteira e ver passar**

Run: `npm run test -w @nxt/workflow-core`
Expected: PASS. Se a Escolha ligada direto a dois Fins falhar pela origem e destino repetidos, corrigir na conversão, sem mudar o interpretador.

- [ ] **Step 8: Compilar e commitar**

Run: `npm run build -w @nxt/workflow-core`. Commit `Vários Fins: cada caminho pode terminar no seu Fim`.

---

### Task 2: Aviso de raia

**Files:**
- Modify: `apps/web/src/lib/editor-bizagi/raias.ts` (recebe `avisoDeRaia`)
- Modify: `apps/web/src/lib/desenho-bpmn.ts:304-308` (sai `avisoDeRaia`; `normaliza` só sai se ficar sem uso)
- Modify: `apps/web/src/lib/desenho-bpmn.test.ts:124-132` (sai o bloco antigo)
- Modify: `apps/web/src/components/processes/desenho-bpmn/canvas-bpmn.tsx:40,270-274` e props
- Modify: `apps/web/src/components/processes/process-flow.tsx` (passa o rótulo)
- Test: `apps/web/src/lib/editor-bizagi/raias.test.ts` (criar, se não existir)

**Interfaces:**
- Produces: `avisoDeRaia(raia: Pick<RaiaDesenho, 'nome' | 'executor'>, step: StepFormSchema | undefined, nomes: { daRaia?: string; responsavel?: string }): string | null`
- Produces: prop de `CanvasBpmn` `rotuloDoExecutorDaRaia: (ex: StepFormSchema['executor']) => string | undefined`, lida pelo mesmo ref `consultas` de `responsavelDe`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
const raia = { nome: 'Solicitante', executor: { papelId: 'p1', entityType: 'ORG', mode: 'FIXA' } }
it('raia sem executor padrão não avisa')   // { nome: 'Solicitante' } com executor @iniciador → null
it('tarefa que herda não avisa')           // executorDaRaia: true → null
it('mesmo executor não avisa')             // papelId 'p1' e executorDaRaia: false → null
it('tarefa automática não avisa')          // stepType: 'serviceTask' → null
it('sem etapa não avisa')                  // step undefined → null
it('outro papel avisa com a frase')
  expect(avisoDeRaia(raia, { ...step, executorDaRaia: false, executor: { papelId: 'p2', entityType: 'ORG', mode: 'FIXA' } }, { daRaia: 'Gestor', responsavel: 'Analista' }))
    .toBe('Está na raia “Solicitante”, cujo executor padrão é Gestor, mas quem executa é Analista.')
it('mesmo papel em outra entidade avisa')  // entityId diferente → frase
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w apps/web -- raias`
Expected: FAIL, função não exportada.

- [ ] **Step 3: Implementar a função e ligar no canvas**

Em `projetarNos`, passar `desenho.raias[i]`, `steps[n.id]` e os nomes. Em `process-flow.tsx`, extrair de `responsavelDe` a montagem do rótulo (`papel` + entidade) para `rotuloDoExecutor(ex)`, usada por `responsavelDe`, por `raiaDaEtapa` e pela nova prop.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test -w apps/web -- raias desenho-bpmn`, depois `npm run type-check -w apps/web`
Expected: PASS, sem erros de tipo.

- [ ] **Step 5: Commitar** — `Aviso de raia só quando há divergência real`.

---

### Task 3: Catálogo e paleta

**Files:**
- Modify: `apps/web/src/lib/editor-bizagi/catalogo.ts`
- Modify: `apps/web/src/lib/editor-bizagi/catalogo.test.ts`
- Modify: `apps/web/src/components/processes/desenho-bpmn/paleta.tsx`

**Interfaces:**
- Produces: `CATALOGO` = `inicio: [Início]`, `tarefa: [Tarefa de usuário, Ação automática]`, `escolha: [Escolha]`, `paralelo: [Ao mesmo tempo]`, `fim: [Fim]`.
- Produces: `CATALOGO_FORA_DA_PALETA` recebe os 7 itens; `TODOS_OS_ITENS` continua achando todos.
- Removes: `ItemCatalogo.etiqueta`, `ROTULO_ETIQUETA`, `CHIP`, `TEMPORIZADOR_PADRAO`, `SUBPROCESSO_PADRAO`.

- [ ] **Step 1: Reescrever `catalogo.test.ts` para o novo catálogo**

```ts
expect(nomes('inicio')).toEqual(['Início'])
expect(nomes('tarefa')).toEqual(['Tarefa de usuário', 'Ação automática'])
expect(nomes('fim')).toEqual(['Fim'])
it('os 7 itens removidos continuam em TODOS_OS_ITENS')
  // Início agendado, Início por evento, Envio de mensagem, Recebimento de mensagem,
  // Fim com erro, Fim com cancelamento, Terminar tudo
it('nada na paleta deixa de executar')
  expect(Object.values(CATALOGO).flat().every(executaHoje)).toBe(true)
it('itemDoArrasto recusa índice que saiu da paleta')
  expect(itemDoArrasto(JSON.stringify({ grupo: 'fim', indice: 1 }))).toBeNull()
it('formaNova dá nome padrão')  // só os itens que ficam, sem config
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test -w apps/web -- catalogo`
Expected: FAIL.

- [ ] **Step 3: Implementar `catalogo.ts`**

`grupo()` deixa de calcular `etiqueta`; `formaNova` deixa de montar `config`, pois nenhum item da paleta tem.

- [ ] **Step 4: Ajustar `paleta.tsx`**

- `rotulo(item)` vira `item.nome`.
- O menu ▾ passa a ter duas colunas (ícone e nome), sem chip.
- Tooltips: `Sequência. Arraste a bolinha de uma forma até outra para ligar.` e `Nova raia. Entra no fim da piscina.`; os "Só documenta" ficam.
- Remover `Relogio`, `Envelope`, `MarcaDoEvento` e demais desenhos só se nada mais usar: `IconeDoItem` ainda desenha formas antigas nas gavetas, então eles tendem a ficar.
- Atualizar o comentário do topo.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test -w apps/web -- catalogo proximo`, depois `npm run type-check -w apps/web`
Expected: testes em PASS. Se o `tsc` só acusar `gavetas.tsx`, a Task 4 resolve; execute as duas antes de commitar.

- [ ] **Step 6: Commitar junto com a Task 4** (ver lá).

---

### Task 4: Gavetas e textos dos itens removidos

**Files:**
- Modify: `apps/web/src/components/processes/desenho-bpmn/gavetas.tsx` (`GavetaFormaNova`, linhas 391-670; `MolduraDaGaveta`, 57-73; `AvisoAindaNaoExecuta`, 55 e 96-102)
- Modify: `apps/web/src/components/processes/desenho-bpmn/gaveta-padrao.tsx:43-50` (sai `SeloProximaRodada`)
- Modify: `apps/web/src/components/processes/desenho-bpmn/gaveta.tsx:34` (sai a prop `selo`, se ficar sem uso)
- Modify: `apps/web/src/components/processes/process-flow.tsx` (linhas 672, 721, 757: comentários; 1074-1084: sai a busca de workflows; 1542: props)
- Modify: `apps/web/src/lib/editor-bizagi/gavetas.ts`, `resumos.ts` e os testes deles
- Test: `apps/web/src/lib/editor-bizagi/gavetas.test.ts`

**Interfaces:**
- Produces: `GavetaFormaNova` sem `workflowsAtivos`, `piscinasExternas`, `saidas` e `onAbrirForma`.
- Removes de `gavetas.ts`: `configTemporizador`, `configSubprocesso`, `configFim`, `configLivre`, `ENVIO_PADRAO`, `RECEBIMENTO_PADRAO`, `INICIO_AGENDADO_PADRAO`, `INICIO_EVENTO_PADRAO`, `camposDoTexto`, `workflowsAtivos`, `WorkflowDaLista`. `comConfig` sai se ficar sem uso.
- Removes de `resumos.ts`: `resumoDoTemporizador`, `resumoDoSubprocesso`, `resumoDoEnvio`, `resumoDoRecebimento`, `resumoDoBaseadoEmEvento`. `resumoDoInicio` e `resumoDoFim` ficam só com o caso simples.
- Mantém em `@nxt/types`: `ConfigForma` e demais tipos, porque desenhos gravados os usam.

- [ ] **Step 1: Escrever o teste que falha** em `gavetas.test.ts`:

```ts
it('forma com item removido preserva a configuração gravada ao mudar o nome')
  // aplicar o patch de nome usado por aoMudarForma: config continua igual
it('forma com item removido abre a gaveta de forma')
  expect(gavetaDaForma({ tipo: 'end', variante: 'erro' }, false)).toBe('forma')
```

Remover os testes das funções excluídas.

- [ ] **Step 2: Rodar e ver falhar ou passar pelo motivo certo**

Run: `npm run test -w apps/web -- gavetas`
Expected: os testes novos passam só se o comportamento já existir; nesse caso, eles ficam como proteção da limpeza. Os testes das funções excluídas já não existem.

- [ ] **Step 3: Reduzir o `switch` de `GavetaFormaNova`**

Ficam `start:simples`, `parallelGateway:` e `end:simples`. O `default` é só `campoNome()`. Com `!executaHoje(forma)`, aparece a nota com a frase fixa da gaveta. Sem `saidas`, o `parallelGateway:` não muda. O botão Remover continua pela moldura.

- [ ] **Step 4: Limpar o restante** conforme o bloco Interfaces, seguindo o que `tsc` e ESLint acusarem como sem uso. Procurar sobras:

Run: `git grep -n -i -E "próxima rodada|próxima entrega|executa hoje|baseado em evento" -- apps packages`
Expected: só `catalogo.ts` (nome do item fora da paleta), `variantes.ts` (rótulo) e testes de recusa. O texto "Executa hoje" não aparece em nenhum.

- [ ] **Step 5: Rodar tudo da web**

Run: `npm run test -w apps/web`, `npm run type-check -w apps/web`, `npm run lint -w apps/web`
Expected: testes em PASS, sem erros de tipo nem de lint.

- [ ] **Step 6: Commitar as Tasks 3 e 4** — `Paleta só com o que executa; gavetas dos itens removidos reduzidas`.

---

### Task 5: Registro e conferência de ponta a ponta

**Files:**
- Modify: `CHANGELOG.md` ("Não lançado")

- [ ] **Step 1: Escrever a entrada**

- **Alterado:** cada caminho do workflow pode terminar no seu próprio Fim; o aviso na tarefa só aparece quando a raia tem executor padrão e a tarefa usa outro.
- **Removido:** da paleta, Início agendado, Início por evento, Envio de mensagem, Recebimento de mensagem, Fim com erro, Fim com cancelamento e Terminar tudo. Desenhos que já os usam continuam abrindo, mas não ativam.

- [ ] **Step 2: Rodar todas as suítes**

Run: `npm run test`, depois `npm run type-check`
Expected: PASS em web, workflow-core, API, contracts-core e screens-core.

- [ ] **Step 3: Conferir no navegador**

Com o PO autorizando religar os servidores (a máquina ficou sem memória em 06/11). Usar um workflow de teste novo, sem mexer nos dois "Solicitação de contratos":

1. A paleta mostra só os itens da spec, nos temas claro e escuro.
2. Desenhar Início → Escolha → dois caminhos → dois Fins, salvar, recarregar: os dois Fins continuam.
3. Editar a condição pela gaveta: os dois Fins continuam.
4. Ativar, iniciar um processo por caminho e ver os dois concluírem.
5. Apagar um Fim ligado: a pendência aparece; o Fim sem seta bloqueia a ativação com a frase da spec.
6. Abrir `Solicitação de contratos` (rascunho) e ver que a bolinha laranja sumiu.

Expected: todos os itens conforme descrito.

- [ ] **Step 4: Commitar** — `CHANGELOG: paleta enxuta e vários Fins`. Abrir o PR só com o ok do PO.
