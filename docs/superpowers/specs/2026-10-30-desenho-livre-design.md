# Desenho livre com setas — especificação

**Data:** 30/10/2026 · **Decisões do PO:** conversa de 30/10/2026 · **Mockup da dinâmica:** https://claude.ai/artifact/G5jNXgrrbp8WEmSQPwmsGm (proposta A)

## Objetivo
Dar ao editor de workflow a liberdade de desenho do Bizagi: **apagar qualquer seta** e **ligar qualquer forma a qualquer forma**, com losangos soltos. A liberdade é do desenho; a execução continua segura: **a ativação só aceita o que vira blocos**, e o motor não muda.

**Sucesso:** desenhar, apagar e religar setas sem o editor recusar; ver na hora o que impede ativar e onde; ativar quando o desenho cabe em blocos; os workflows de hoje abrem idênticos.

## Decisões
| Tema | Decisão |
|---|---|
| Abordagem | **A:** desenho livre no editor; a ativação converte o desenho em blocos e recusa o que não converte. O motor não muda. |
| Fonte da verdade | **O desenho** (formas + setas). Os blocos são **derivados** (caminho 1). |
| Losangos | **Soltos, como no Bizagi:** o que divide e o que junta são peças separadas. |
| Condição de um caminho | **Nos dois lugares:** clicar na seta abre a condição dela; clicar no losango lista as setas que saem, cada uma com a sua. |
| Etapa que não leva ao Fim | **Impede ativar** (era aviso; PO, 30/10/2026). Vale para **todos** os workflows. |
| Salvar rascunho | **Sempre**, mesmo com o desenho incompleto. |
| Roteiro com desenho incompleto | Aviso com as pendências; etapas seguem configuráveis; estrutura pela lista bloqueada até o desenho caber em blocos (spec do Roteiro, §4). |
| Início / Fim | Um de cada (como hoje). Caminho que termina no Fim = "encerra o processo". |
| Entrega | **Três PRs:** motor → API → editor. |

## Invariantes
- O motor só recebe blocos: na ativação, o **servidor** converte o desenho; o que vem do navegador não é aceito pronto.
- As regras de hoje continuam valendo depois da conversão (`validarBlocos`, `validarDesenho`, `validarAtividades` etc.), com as mesmas frases.
- Workflows existentes abrem idênticos; nenhuma migração de banco (tudo em `formSchema`, JSON).
- Um só desfazer para Desenho e Roteiro; ids iguais nas duas vistas.

## 1. O que a pessoa faz no desenho
- **Paleta:** Tarefa, Automática, Escolha (losango ×), Ao mesmo tempo (losango +), Raia. Losangos entram **soltos** (um por vez).
- **Soltar uma forma:** sobre uma seta → entra no meio dela (a seta se divide em duas); no vazio → fica solta (pendência "solta").
- **Ligar:** arrastar a bolinha da borda de uma forma até outra cria a seta. Recusadas na hora (não fazem sentido em desenho nenhum): seta chegando no Início; saindo do Fim; de uma forma para ela mesma; repetida entre as mesmas duas formas; solta no vazio (não é criada). Todo o resto é aceito.
- **Religar:** arrastar a ponta de uma seta para outra forma.
- **Apagar:** clicar na seta → "Apagar seta" ou Delete. Apagar uma forma leva as setas dela.
- **Configurar:** seta que sai de uma Escolha → painel com a condição dela (o construtor de condição de hoje); outras setas → só "Apagar". Losango de Escolha → painel de hoje: pergunta, modo ("o primeiro que servir" / "todos os que servirem"), a lista das setas que saem com as condições, Testar. Etapas → as 5 perguntas.
- **Verificação ao vivo:** a pílula do topo separa **desenho incompleto** (solta, inalcançável, não chega ao Fim) de **o motor não executa** (recusas do conversor, §2). Clicar destaca a forma/seta culpada; setas com problema em vermelho tracejado.
- **Ativar:** recusa enquanto houver pendência que impede, listando os problemas.

## 2. O conversor (`desenhoParaBlocos`)
Percorre o desenho a partir do Início e monta `FluxoBlocos`. Devolve `{ ok: true, fluxo }` ou `{ ok: false, problemas }`, cada problema com **frase** e **formas/setas culpadas**.

**Aceita:**
- **Sequência:** etapa com uma seta saindo.
- **Escolha:** losango × com ≥2 setas saindo (cada uma = um caminho, com sua condição). Os caminhos se reencontram num **losango × que junta** ou **direto numa mesma etapa** (reencontro implícito). Um caminho pode terminar no **Fim** (encerra).
- **Volta:** seta para uma etapa anterior saindo da **última etapa de um caminho de escolha** ou do **próprio losango** → "volta para X".
- **Ao mesmo tempo:** losango + com ≥2 setas saindo; todos os ramos chegam a **um losango + que junta**.
- **Encaixes:** qualquer combinação dos anteriores.
- **Losango com 1 entrada e 1 saída:** ignorado, com aviso "losango sem efeito".

**Recusa** (frase mostrada):
| Desenho | Frase |
|---|---|
| Duas ou mais setas saindo de uma etapa | "Saem N setas de 'X'. Para decidir entre elas, use uma Escolha; para fazer as duas, um Ao mesmo tempo." |
| Losango + juntando caminhos de uma Escolha | "A junção espera todas as setas, mas elas vêm de uma escolha: só um caminho acontece e o processo ficaria parado." |
| Ramos de Ao mesmo tempo chegando direto numa etapa ou num losango × | "Junte os ramos com um losango +; sem ele, 'X' seria criada duas vezes." |
| Volta que não sai de um caminho de escolha | "A volta de 'X' para 'Y' não depende de decisão: o processo repetiria para sempre." |
| Caminho que salta para depois do ponto em que os caminhos se juntam | "Este caminho salta para depois do ponto em que os caminhos se juntam. Ligue-o ao losango que junta." |
| Volta/encerra dentro de Ao mesmo tempo, caminho sem condição, volta inválida etc. | As frases de hoje (`validarBlocos`), sobre os blocos montados. |
| Solta, inalcançável, não chega ao Fim | As frases de hoje (`validarDesenho`); "não chega ao Fim" passa a ser **erro**. |

**Roda** no editor (a cada mudança, memorizado) e no servidor (na ativação, a conversão que vale).

## 3. Gravação (`formSchema`)
- `desenho` **versão 2**: `formas` (id, tipo, nome; nos losangos, `modo` e `pergunta`), `setas` (id, de, para; saindo de Escolha: `condition`, `conditionSpec`, `rotulo`), `posicoes`, `raias`. **É a fonte da verdade.**
- `blocos`: **cópia derivada**, gravada só quando o desenho converte (o Roteiro e a vista por raia leem ao abrir).
- `steps`: sem mudança (por id da etapa).
- **Blocos ganham `juntaId?`** em `BlocoEscolha` e `BlocoParalelo`: o id do losango que junta desenhado. `blocosParaGrafo` usa `juntaId ?? id + SUFIXO_REENCONTRO`. Reencontro implícito (sem losango) não tem `juntaId`: uma mudança de estrutura pelo Roteiro nessa escolha acrescenta o losango de junção ao desenho.
- **Workflows existentes:** conversão **na abertura**. Feitos em blocos → desenho v2 gerado dos blocos + posições atuais (idêntico na tela; gravado como v2 no próximo Salvar). Antigos de desenho livre (hoje só leitura) → **editáveis**; a ativação explica se não converterem.
- **API:** a gravação aceita o desenho v2; a ativação converte o v2 e segue o caminho de hoje (blocos → grafo → BPMN); sem v2, usa os blocos. "Só desenho não volta a rascunho" (#90) compara formas e setas, ignorando posições e raias.

## 4. Editor e Roteiro sobre o desenho
- **Estado:** desenho v2 + `steps` (+ ordem de raias). `conversao = desenhoParaBlocos(desenho)` memorizado.
- **Desenho:** as ações de §1 mexem direto em formas/setas.
- **Roteiro:** as ações de hoje aplicam-se aos **blocos derivados** (mesmas funções e proibições) e voltam ao desenho por **`blocosParaDesenho(fluxo, desenhoAtual)`**, que preserva ids, posições e raias do que já existia; formas novas ganham posição automática (`completarPosicoes`).
- **Desenho incompleto:** Desenho tudo permitido; Roteiro com o aviso "O desenho tem N pendências. Termine as ligações no Desenho para ver o roteiro completo" (pendências clicáveis), **todas as etapas** listadas em ordem de posição no desenho (esquerda → direita) e configuráveis, e estrutura bloqueada com o motivo; "Ver por raia" mostra o desenho como está (layout automático).
- **Desfazer:** o histórico guarda desenho v2 + `steps`; uma ação do Roteiro é **um** passo.
- **Seleção:** mesmos ids nas duas vistas.

## Componentes
| Unidade | O que faz | Onde |
|---|---|---|
| `DesenhoV2` (tipos) | formas, setas, posições, raias | `packages/types` |
| `desenhoParaBlocos` | conversor §2 (puro) | `packages/workflow-core/src/desenho-livre.ts` |
| `blocosParaDesenho` | blocos → desenho preservando ids/posições (puro) | idem |
| `lerDesenhoV2` | lê/valida o JSON gravado; gera v2 a partir de blocos (abertura) | idem |
| `juntaId` | campo novo nos blocos; `blocosParaGrafo` o usa | `packages/workflow-core/src/blocos.ts` |
| Gravação/ativação | aceita v2; converte na ativação; regra de "só desenho" | `apps/api/src/processes/processes.service.ts` |
| Canvas livre | ligar, religar, apagar, soltar sobre seta, painel da seta | `apps/web/src/components/processes/desenho-bpmn/*` |
| Editor | estado v2, conversão memorizada, pendências, Roteiro via `blocosParaDesenho` | `apps/web/src/components/processes/process-flow.tsx` |

## Erros e casos de borda
- **Desenho que não converte** salva normalmente; a ativação devolve 400 com as frases e os culpados.
- **Condição numa seta que deixou de sair de uma Escolha** (religada): fica guardada, sem efeito, e some ao salvar.
- **Losango (× ou +) com uma entrada e uma única saída:** ignorado na conversão, com o aviso "losango sem efeito" (§2); não impede ativar.
- **Fim inalcançável / sem Início ligado:** frases de hoje.
- **Workflow ativo:** as regras de "só desenho não volta a rascunho" e de "perguntar antes de sair" (#92) continuam valendo.

## Testes
- **Motor (vitest):** `desenhoParaBlocos` — um teste por formato aceito e um por recusa (frase + culpados); **ida e volta** blocos → desenho → blocos idênticos (escolha "todos" e "primeiro", vinculada, Senão antigo, encaixes, e o "Solicitação de contratos" real); `blocosParaDesenho` preserva ids/posições/raias; "não chega ao Fim" é erro.
- **API (vitest):** ativação com v2 convertível ativa; não convertível recusa com frase e culpados; só blocos (antigo) ativa; "só desenho" com v2.
- **Navegador** (workflow real, trava, banco conferido): abre idêntico; apagar/criar/religar setas; soltar forma sobre seta; pendências e aviso no Roteiro; consertar e ver o Roteiro voltar; desfazer.

## Entrega
Três PRs, a partir de `local/tudo-junto` (o editor atual está nos PRs #91–#95, ainda não mesclados; a dependência fica escrita em cada PR):
1. **Motor:** conversor, `blocosParaDesenho`, `juntaId`, testes. Nada muda na tela.
2. **API:** v2 na gravação e na ativação; "não chega ao Fim" como erro.
3. **Editor:** desenho livre, Roteiro e desfazer sobre o desenho.

## Fora do escopo
- Mais de um Início ou Fim no desenho.
- Mudanças no motor (fichas, junções, voltas): o motor continua recebendo só blocos.
- Desenhos que só um motor de grafo livre executaria (proposta C).
