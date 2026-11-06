# Editor de workflow no estilo Bizagi — especificação

**Data:** 03/11/2026 · **Revisão vigente:** 06/11/2026 · **Decisões do PO:** quiz e conversa de 03/11/2026 e quiz de 06/11/2026 · **Mockup aprovado:** https://claude.ai/artifact/8QjkU7Sx9C6kjMPrcuhZFb (v2, com "próximo item")

> **Leia primeiro a Revisão de 06/11/2026, logo abaixo.** Quando houver conflito, ela prevalece. O restante do documento fica como histórico do que foi planejado em 03/11. O motor **não** vai executar temporizador, subprocesso nem os fins especiais.

## Revisão de 06/11/2026 (vigente)

### Objetivo
A paleta só oferece o que funciona. Saem os itens que o motor não executa, e cada caminho do workflow pode terminar no seu próprio Fim.

**Sucesso:** tudo o que a paleta oferece pode ser ativado, exceto os itens que só documentam, que não impedem a ativação. Um workflow com vários Fins ativa e conclui por qualquer um deles. Workflows existentes abrem e rodam iguais. Nenhum texto promete entrega futura.

### Decisões do PO (quiz de 06/11/2026)
| # | Tema | Decisão |
|---|---|---|
| 1 | Início agendado e Início por evento | Saem da paleta. |
| 2 | Envio de mensagem e Recebimento de mensagem | Saem da paleta. |
| 3 | Fim com erro, Fim com cancelamento e Terminar tudo | Saem da paleta. |
| 4 | Vários Fins | **Permitir**, todos como Fim simples. Dentro de "Ao mesmo tempo", a recusa de hoje continua. |
| 5 | Piscina, Fase e Fluxo de mensagem | Ficam e continuam só documentando. |
| 6 | Aviso de raia | Só aparece quando a raia tem executor padrão e a tarefa usa outro. |

Temporizador, subprocesso, losango inclusivo e baseado em evento já estão fora da paleta e continuam fora.

### Paleta depois da revisão
| Grupo | Itens |
|---|---|
| Início | Início |
| Tarefa ▾ | Tarefa de usuário, Ação automática |
| Escolha | Escolha |
| Ao mesmo tempo | Ao mesmo tempo |
| Fim | Fim |
| Conectores | Sequência, Fluxo de mensagem |
| Estrutura | Piscina, Raia, Fase |

- O ▾ só continua na Tarefa, porque o Início e o Fim ficam com um item cada.
- A etiqueta de execução sai do ▾ e dos tooltips das formas, já que tudo o que fica ali executa. O tooltip "Só documenta" continua em Piscina, Fase e Fluxo de mensagem.
- Saem as etiquetas "Executa hoje" e "Próxima rodada".

### Desenhos que já usam um item removido
- Os itens removidos passam para `CATALOGO_FORA_DA_PALETA`: a forma continua abrindo, com nome e ícone, mas não se cria outra.
- O rascunho continua salvando, e a ativação continua recusando, agora sem o "ainda", que prometia entrega: `"<nome>" é <rótulo>, que não executa. Troque por outro elemento ou deixe o workflow em rascunho.`
- A gaveta dessas formas fica só com o nome, o aviso de que não executa e o botão Remover. A configuração gravada no desenho é preservada, mas não é mais editada.
- Saem as perguntas específicas dessas gavetas e os textos que citam temporizador, subprocesso e baseado em evento (`gavetas.tsx`).
- No banco de desenvolvimento, nenhum desenho usa esses itens (conferido em 06/11/2026). Outros ambientes não foram conferidos, por isso a tolerância continua.

### Vários Fins
O motor já aceita: o interpretador só marca que o processo passou por um fim (`reachedEnd`), e o processo conclui quando não resta nenhum token. A trava está na conversão do desenho (`desenhoParaBlocos`, em `desenho-livre.ts`), e os blocos têm um único `fimId`.

- **Conversão:** antes de converter, as setas que chegam a qualquer Fim simples passam a apontar para um único Fim. Os blocos e o grafo continuam com um Fim só, sem mudança em `FluxoBlocos`, `WfGraph`, interpretador, API ou banco.
- **Ao mesmo tempo:** a regra atual vale sem código novo, pois a conversão enxerga os Fins como um só. Um ramo que encerra o processo continua recusado.
- **Fim sem seta chegando:** com mais de um Fim no desenho, vira pendência que impede ativar, com a forma em destaque: `O Fim "<nome>" não recebe nenhuma seta. Ligue um caminho a ele ou apague-o.`
- **Desenho com dois Inícios:** continua recusado, como hoje.
- **Frase removida:** "Vários Fins chegam na próxima entrega."
- **Ativo volta a rascunho?** Acrescentar ou religar um Fim sem mudar o que executa não devolve o workflow a rascunho; `assinaturaDoQueExecuta` precisa comparar o resultado já convertido.
- **Assinatura:** o `fimId` escolhido na conversão sai da comparação (`normalizarFluxo`). Sem isso, apagar o primeiro Fim mudaria a assinatura sem mudar a execução.
- **Ações que passam pelos blocos:** `blocosParaDesenho` monta um Fim só e descartaria os outros quando uma ação alterasse a estrutura pelos blocos. Ele passa a preservar os Fins do desenho anterior: a seta nova para o Fim volta ao Fim de antes pelo mesmo `id` ou, se não houver, pela mesma forma de origem. Sem correspondência, ela chega ao Fim principal. Um Fim que fique sem seta continua no desenho e vira a pendência acima, nunca some em silêncio.
- **Editor:** o canvas desenha a partir do documento (`grafoDoDoc`), então os vários Fins já aparecem. Clicar na paleta sem seleção continua colocando a forma antes do primeiro Fim.

### Aviso de raia
- Hoje o aviso compara o **nome** da raia com o nome do responsável, por isso acusa "Solicitante" × "Quem iniciou o processo" sem haver divergência real.
- Passa a valer: a raia tem `executor.papelId` definido, a tarefa não herda da raia (`herdaDaRaia`) e o executor dela é outro (outro `papelId` ou outro `entityId`). Raia sem executor padrão nunca gera aviso. Tarefa automática também não.
- Frase: `Está na raia "<raia>", cujo executor padrão é <papel da raia>, mas quem executa é <responsável>.`
- Continua sendo só um aviso: não impede ativar e não altera o selo "Pronto para ativar".

### Padrões adotados: revise
- **Sem migração de dados:** os desenhos gravados não são alterados. Só a conversão enxerga os Fins como um.
- **O histórico não diz por qual Fim o processo terminou.** Com um Fim só no grafo, nomes como "Aprovado" e "Recusado" aparecem só no desenho, e o processo fica como concluído nos dois casos. Registrar o Fim alcançado exigiria mudar blocos, grafo e histórico, e fica fora desta entrega.
- **Encerramento com problema:** um caminho de "recusado" termina em Fim simples, e o processo fica **concluído**. Para ficar como cancelado, continua sendo preciso cancelar à mão.
- **Associação:** continua fora da paleta (padrão de 03/11).

### Fora do escopo
Execução de temporizador, subprocesso, fins especiais, mensagens e inícios especiais. Tabela `WorkflowTimer`, campos `parentInstanceId` e `parentTokenId`, tipos `timerEvent` e `callActivity`, `endKind` e status novos. Nenhuma migração de banco. O `executaHoje` continua, porque a recusa na ativação depende dele.

### Testes
- **workflow-core:** dois e três Fins ativam e concluem por qualquer um; Escolha com um Fim por caminho; ramo de "Ao mesmo tempo" indo a um Fim continua recusado; Fim sem seta vira pendência; dois Inícios continuam recusados; forma com variante removida continua recusada; workflow de um Fim gera o mesmo grafo de antes; trocar o Fim de destino sem mudar o que executa mantém `assinaturaDoQueExecuta`. O teste da frase antiga, em `desenho-livre-recusas.test.ts`, é atualizado.
- **Web:** catálogo com os itens da tabela acima; item removido continua sendo encontrado em `TODOS_OS_ITENS`; aviso de raia nos quatro casos (sem executor, herda, mesmo executor, outro executor).
- **Navegador:** desenhar uma Escolha com dois Fins, ativar e concluir um processo por cada caminho; conferir a paleta e as gavetas nos temas claro e escuro.

### Versão e documentos
- `CHANGELOG.md`: entrada em "Não lançado". A entrada 2.0.0 fica como está, pois registra o que foi lançado.
- Número de versão e tag só com o PO (`docs/versionamento.md`).

---

*O que vem a seguir é o texto de 03/11/2026. O PR 1 foi entregue na versão 2.0.0; o que tratava dos PRs 2, 3 e 4 foi cancelado.*

## Objetivo
Deixar a tela de parametrização do workflow igual à do Bizagi: paleta completa em grade, piscinas, raias e fases, e a parametrização de cada elemento aberta direto do desenho. E fazer o motor executar três elementos novos: **temporizador**, **subprocesso** e **fim com erro ou cancelamento**.

**Sucesso:** desenhar como no Bizagi; um clique seleciona e mostra o próximo item; duplo clique abre a parametrização de qualquer elemento; os workflows de hoje abrem idênticos e continuam rodando; temporizador, subprocesso e fins novos executam de ponta a ponta.

## Decisões (quiz de 03/11/2026)
| # | Tema | Decisão |
|---|---|---|
| 1 | Elementos que o motor não executa | **Executáveis**, por rodadas. Nesta entrega executam os do item 2; os outros já são desenháveis, com a etiqueta "Próxima rodada". |
| 2 | Executáveis nesta entrega | **Temporizador intermediário**, **subprocesso** (chama outro workflow), **fim com erro** e **fim com cancelamento**. |
| 3 | Paleta | Grade de 2 colunas, só ícones, nome no tooltip, recolhível. |
| 4 | Variações | Setinha ▾ abre os subtipos; o escolhido passa a ser o da célula. |
| 5 | Grupos | Eventos, tarefa e subprocesso, losangos, conectores, piscina/raia/fase. Sem anotações, objetos de dados, grupo, imagem, texto e formas personalizadas. |
| 6 | Piscinas | **Várias:** a principal (o workflow) + piscinas de participantes externos. |
| 7 | Raias e fases | Raias + fases; **orientação horizontal ou vertical por workflow**. |
| 8 | Abas | Sem abas; o topo mantém nome, versão, salvar e ativar. |
| 9 | Canvas | Grade com encaixe, guias de alinhamento, laço com alinhar/distribuir, redimensionar tarefa, raia e piscina. Zoom continua. |
| 10 | Abrir parametrização | **Duplo clique** (ou Enter, ou "Parametrizar" no menu da seleção). Clique simples só seleciona. |
| 11 | Onde abre | Gaveta lateral à direita (a de hoje). |
| 12 | Conteúdo por elemento | Como no mockup (§3). |
| 13 | Raia | Tem **executor padrão**; a tarefa herda e pode trocar. |
| 14 | Roteiro | **Sai.** O desenho é o único editor. |
| 15 | Cores | As do Nxt. |
| — | Próximo item (03/11) | Um clique numa forma mostra, à direita dela, a coluna Tarefa, Escolha, Evento intermediário │ Subprocesso, Fim. Clique cria ao lado já ligado; arrastar cria onde soltar, já ligado. |

### Pontos que o PO deixou em aberto: o padrão adotado (revise)
- **Associação:** fica **fora da paleta**; sem anotação ela não liga nada (5F não foi marcado).
- **Piscina externa:** **caixa-preta** de um participante externo: a contratada do contrato do processo, um fornecedor fixo ou um órgão/sistema externo. Nesta entrega ela e o fluxo de mensagem **só documentam**.
- **Subprocesso que termina com erro:** nesta entrega o pai **também encerra com erro**. "Seguir por um caminho de erro" pede evento de borda e fica para outra rodada.

## Invariantes
- O motor só recebe blocos: a ativação converte o desenho no **servidor** (como hoje).
- Workflows existentes abrem idênticos e as instâncias em andamento seguem com o `graphSnapshot` delas.
- Sem migração para o desenho (continua em `formSchema`, JSON). As migrações de banco são só as do motor (§4).
- Salvar rascunho aceita qualquer desenho; **ativar** recusa com frase clara o que o motor não executa.

## 1. O que entra na ativação
| Elemento | Na ativação |
|---|---|
| Início, Tarefa de usuário, Ação automática, Escolha, Ao mesmo tempo, Inclusivo, Fim | Como hoje. |
| **Fim** (vários) | Agora pode haver **mais de um** Fim. Caminho que chega em qualquer Fim simples = encerra. |
| **Fim com erro / com cancelamento** | Executa (§4). |
| **Temporizador intermediário** | Executa (§4). |
| **Subprocesso que chama outro workflow** | Executa (§4). |
| Início agendado, Início por evento, Envio/Recebimento de mensagem, Recebe/Envia mensagem, Baseado em evento, Subprocesso embutido, Terminar tudo | **Impedem ativar:** "'X' é um(a) Y, que ainda não executa. Troque por outro elemento ou deixe o workflow em rascunho." |
| Piscinas externas, fluxo de mensagem, fases | Ignorados (só documentam). |
| Posição das formas em raias | A raia dá o executor padrão (§3). |

## 2. Editor
- **Topo:** nome, versão, desfazer/refazer, Horizontal | Vertical, Grade, zoom (− % + Ajustar), alinhar (aparece com 2+ formas), pílula de pendências, Salvar rascunho, Ativar. Sem a aba Roteiro.
- **Paleta** (esquerda, recolhível): Início ▾, Tarefa ▾, Subprocesso ▾, Losango ▾, Intermediário ▾, Fim ▾ · Sequência, Fluxo de mensagem · Piscina, Raia, Fase. Cada variação mostra a etiqueta *Executa hoje / Novo nesta entrega / Próxima rodada*. Arrastar põe onde soltar; clique ou Enter põe depois da selecionada, já ligada.
- **Seleção:** clique seleciona (Shift soma); laço no vazio seleciona várias. Uma forma selecionada mostra: menu pequeno acima (Parametrizar, Apagar), a coluna **próximo item** à direita, a bolinha de **ligar** embaixo e, em tarefa/subprocesso, a alça de tamanho.
- **Ligar:** arrastar a bolinha até outra forma cria a seta do conector ativo na paleta (Sequência por padrão). As recusas de hoje continuam ("nada chega no Início" etc.), mais: sequência não cruza piscinas; fluxo de mensagem só entre piscinas diferentes.
- **Mover:** encaixe na grade de 10 px e guias quando o centro alinha com outra forma. Setas do teclado movem 10 px.
- **Piscina, raia, fase:** a raia é redimensionada pela borda de baixo (de lado, na vertical); a piscina principal pela borda do fim. Paleta: Raia acrescenta no fim; Fase acrescenta no fim e alonga a piscina; Piscina acrescenta uma externa embaixo.
- **Orientação:** a vertical é a horizontal transposta (raias em pé, fluxo descendo). Grava por workflow.
- **Pendências** (pílula): o que impede ativar, como hoje, mais as recusas do §1. Clicar seleciona a forma culpada.
- **Desfazer:** um histórico para tudo, inclusive o que se aplica na gaveta.

## 3. Parametrização (duplo clique → gaveta)
| Elemento | Gaveta |
|---|---|
| Tarefa de usuário | As 5 perguntas de hoje. "Quem faz?" começa em **o padrão da raia**. |
| Ação automática | Nome, conector, política de devolução (hoje). |
| Escolha / Inclusivo | Pergunta, modo, caminhos com as condições (link para a seta), Testar (hoje). |
| Ao mesmo tempo | Nome e explicação. |
| Seta que sai de Escolha | Rótulo e condição, ou "caso contrário" (hoje). Outras setas: rótulo. |
| **Temporizador** | Nome. Esperar: **um prazo** (N dias úteis / dias corridos / horas úteis) **ou uma data do contrato** (N dias antes/depois de vencimento, assinatura ou início da vigência). Calendário da organização. |
| **Subprocesso** | Qual workflow (só ativos); versão: sempre a ativa ou fixa; o que vai junto (o contrato do processo, campos escolhidos); esperar terminar (sim/não); se terminar com erro: o pai encerra com erro. |
| **Fim com erro** | Nome, motivo mostrado, código. |
| **Fim com cancelamento** | Nome, motivo, avisar quem iniciou. |
| Início / Fim | Nome. |
| Raia | Nome e **executor padrão** (papel). Quantas tarefas usam o padrão. |
| Fase | Nome e prazo (opcional, só informativo nesta entrega). |
| Piscina principal | Nome, descrição, quem pode iniciar, orientação. |
| Piscina externa | Nome, quem é, como interage. |
| Elementos de "Próxima rodada" | Os campos do mockup, gravados; a etiqueta explica que ainda não executam. |

**Raia com executor padrão:** a tarefa sem executor próprio usa o da raia em que está **no momento da ativação**. Mudou de raia, muda de executor. Escolher outro na tarefa desliga a herança daquela tarefa.

## 4. Motor e API
### Blocos e grafo
- `ItemFluxo` ganha `ItemEspera` (temporizador) e `ItemSubprocesso`. Ambos se comportam como uma atividade na sequência.
- `FimCaminho` ganha `{ tipo: 'erro', fimId }` e `{ tipo: 'cancela', fimId }`; `encerra` passa a ter `fimId` (vários Fins).
- `WfNodeType` ganha `timerEvent`, `callActivity` e o `end` ganha `endKind?: 'erro' | 'cancela'`.

### Temporizador
- O token **descansa** no `timerEvent`; efeito `startTimer` com o vencimento calculado pela API (calendário de `business-time.ts`; data do contrato lida do contrato do processo).
- Tabela nova **`WorkflowTimer`** (instância, token, nó, `dueAt`, `firedAt`, `canceledAt`). A varredura de 5 min dispara os vencidos (`fireTimer` → token segue). Atraso máximo: o ciclo da varredura.
- Data do contrato vazia ou já passada: dispara na próxima varredura e registra o motivo no histórico.
- Devolver atravessando um temporizador: permitido; o temporizador pendente é cancelado e rearmado quando o processo passar de novo.

### Subprocesso
- Efeito `startSubprocess`: a API inicia uma instância do workflow escolhido (versão ativa ou a fixada), com o contrato do processo e os campos marcados.
- `ProcessInstance` ganha `parentInstanceId` e `parentTokenId`.
- **Esperar = sim:** o token do pai descansa até o filho terminar. Filho **concluído** → pai segue. Filho **com erro** ou **cancelado** → pai encerra com erro ("O subprocesso 'X' terminou com erro: motivo").
- **Esperar = não:** o pai segue na hora; o filho corre sozinho.
- Cancelar o pai cancela os filhos ainda vivos e os temporizadores pendentes.
- Devolver atravessando um subprocesso: **bloqueado** (como ação automática), com a frase de hoje adaptada.
- Workflow chamado inativado depois: a ativação do pai avisa; em execução, o pai encerra com erro "O workflow 'X' não está ativo".
- Ciclo (A chama B que chama A): a ativação recusa.

### Fins
- **Fim com erro:** a instância encerra na hora com status `ERROR` (já existe), motivo e código no histórico. Tarefas abertas e temporizadores são cancelados. Compensações **não** são desfeitas.
- **Fim com cancelamento:** igual ao cancelamento manual de hoje (status `CANCELLED`, desfaz o que tem inversa), com o motivo do desenho; avisa quem iniciou se marcado.

## 5. Gravação (`formSchema.desenho`, v2 com campos novos opcionais)
- `formas[].tipo` aceita os tipos novos e `variante` (o subtipo da paleta).
- Formas guardam a configuração delas (temporizador, subprocesso, fins, elementos de próxima rodada).
- `raias[]` ganha `papel` (executor padrão).
- Novo `layout`: `orientacao`, `fases[]` (id, nome, largura, prazo), `piscinasExternas[]`, `fluxosMensagem[]`, `tamanhos` (largura/altura por forma), largura da piscina.
- Desenho antigo sem esses campos abre como hoje (horizontal, sem fases, sem piscinas externas).

## 6. O que sai
- O **Roteiro** e a vista "Ver por raia" saem da tela. As funções de blocos continuam (a ativação usa).
- A aba e os componentes `components/processes/roteiro/` são removidos, e os testes deles também.

## Entregas (PRs, nesta ordem)
1. **Editor:** paleta Bizagi, próximo item, duplo clique, canvas (grade, guias, laço, alinhar, tamanhos), fases, orientação, piscinas externas e fluxo de mensagem, raia com executor padrão, Roteiro fora. Os quatro elementos novos já desenháveis, mas **impedem ativar** até o PR deles. **Entregue na versão 2.0.0 (#104).**
2. ~~**Fins com erro e cancelamento** + vários Fins (motor, API, gaveta).~~ **Cancelado em 06/11/2026.** Só os vários Fins continuam, na forma descrita na Revisão.
3. ~~**Temporizador** (motor, migração `WorkflowTimer`, varredura, gaveta, histórico da instância).~~ **Cancelado em 06/11/2026.**
4. ~~**Subprocesso** (motor, migração de `ProcessInstance`, API, gaveta, link pai ↔ filho na instância).~~ **Cancelado em 06/11/2026.**

A entrega que resta é uma só, descrita na Revisão de 06/11/2026: limpeza da paleta, vários Fins e aviso de raia.

Cada PR entra no `CHANGELOG.md` em "Não lançado". Número de versão e tag só com o PO (docs/versionamento.md).

## Testes
- **workflow-core:** conversor (tipos novos, vários Fins, recusas do §1); interpretador (espera e disparo do temporizador, subprocesso com e sem espera, fins com erro e cancelamento cancelando tokens).
- **API:** varredura de temporizadores; ciclo de vida pai ↔ filho; cancelamento em cascata; devoluções.
- **Web:** funções puras do editor (transposição da orientação, encaixe e guias, posição do próximo item, herança do executor da raia); abrir os workflows existentes sem diferença no desenho.
