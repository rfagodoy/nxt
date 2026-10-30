# Roteiro: o workflow em lista, ao lado do desenho — especificação

**Data:** 30/10/2026 · **Decisões do PO:** conversa de 30/10/2026 · **Mockups:** três propostas https://claude.ai/artifact/GuqWYkrnqxVpDZS43G6do1 (escolhida: C · Roteiro) · vídeo https://claude.ai/artifact/KmuFwBkc2z9WJM7GYTGpz9

## Objetivo
Tornar a parametrização do workflow intuitiva. O editor ganha a vista **Roteiro**: o processo como uma **lista na ordem em que acontece**, com a configuração de cada etapa ali mesmo e o desenho ao lado como prévia. O desenho BPMN (PR #87) continua existindo e editável. As duas vistas são duas portas para o mesmo workflow.

**Sucesso:** configurar um workflow inteiro (etapas, quem faz, prazo, tela, escolhas, voltas) sem abrir a aba Desenho, conferindo pela lista o que falta.

## Decisões
| Tema | Decisão |
|---|---|
| Onde se parametriza | **Nas duas vistas**, com a **mesma configuração** por trás. O Roteiro é a principal. |
| Vista inicial | O editor sempre abre no **Roteiro**. |
| Estrutura pelo Roteiro | **Tudo:** incluir e remover etapas, incluir escolhas e "ao mesmo tempo", reordenar arrastando, definir fim de caminho (segue / encerra / volta). |
| Configuração da etapa | **Dentro da lista:** a etapa se expande no lugar, com as 5 perguntas. A prévia do desenho continua visível. |
| Prévia do desenho | **Só olhar e selecionar:** destaca a etapa aberta; clicar numa caixa abre essa etapa na lista. Arrastar e desenhar ficam na aba Desenho. |
| Workflow antigo (só leitura) | Roteiro **desabilitado** no seletor, com a explicação. |
| Workflow novo | Abre no Roteiro com Início, Fim e "+ primeira etapa". |
| Lista antiga ("Montar") | **Não volta.** O Roteiro é desenhado a partir do mockup C; reaproveita só peças internas vivas (configuração de bloco). |
| Entrega | **Dois PRs:** (1) separar as perguntas da etapa num componente; (2) o Roteiro. Os dois entram também em `local/tudo-junto` (máquina do PO). |

## Invariantes
- `FluxoBlocos` continua sendo a **fonte da verdade**. Roteiro, prévia e Desenho leem o mesmo estado do editor (`fluxo`, `steps`, `desenho`). Não há cópia, então não há sincronização a fazer.
- Toda ação de estrutura no Roteiro usa as **mesmas funções** do desenho (`inserir`, `remover`, `moverItem`, `atualizarCaminho`, vínculo) e as **mesmas proibições** (`validarBlocos`, destinos de volta), com as mesmas frases.
- Um só desfazer/refazer, um só "não salvo", um só Salvar/Ativar, a mesma proteção ao sair (PR #92) e as mesmas pendências nas duas vistas.
- Nada muda na API nem no banco.
- Identidade Nxt (Manrope + Space Mono, verde de ação, fundo bruma), claro e escuro, densidade do usuário.

## 1. Estrutura da tela
- **Topo:** o atual, mais o seletor **Roteiro | Desenho** logo depois do nome. "Ver por raia" continua no menu ⋯. "Organizar" só aparece no Desenho.
- **Trocar de vista** não grava nem perde nada.
- **Corpo do Roteiro:** lista à esquerda (560–680 px, rolagem própria) e prévia do desenho à direita (o resto).
- **Telas estreitas** (abaixo de ~1.100 px): a prévia some; um botão "Ver desenho" leva à aba Desenho. A lista ocupa a largura toda.
- **Pendências:** a pílula do topo vale nas duas vistas. No Roteiro, clicar numa pendência abre o item certo na lista, já na pergunta que falta.

## 2. A lista
Os itens aparecem de cima para baixo, ligados por uma linha vertical. O conteúdo de escolhas e "ao mesmo tempo" fica recuado.

- **Início:** primeira linha, com quem pode iniciar ("Quem clica em + Novo processo · *papel*"). Clicar abre a configuração atual de "Quem inicia".
- **Etapa fechada:** nome e etiquetas: 👤 papel · unidade · ⏱ prazo · ▤ tela e ação (consultar / editar / criar) · ↩ devolução (só quando difere do padrão).
  - Automática: ⚡ e o nome da ação no lugar de quem faz.
  - Vinculada: etiqueta "mesma etapa que *X*".
  - Pendência: etiqueta tracejada âmbar ("falta prazo"). Tudo respondido: ✓ verde.
- **Escolha:** cartão lilás. Cabeçalho com ◇ nome e modo ("o primeiro que servir" / "todos os que servirem"). Cada caminho começa pela condição em frase e tem suas etapas recuadas. O fim do caminho aparece numa linha: **→ segue**, **■ encerra o processo**, **↩ volta para *X***. O "Senão" antigo aparece com o aviso que já existe.
- **Ao mesmo tempo:** cartão rosado, ramos com etapas recuadas, rodapé "espera todos os ramos para seguir".
- **Fim:** última linha.
- **Encaixes profundos** só ganham mais recuo e a cor do grupo. Nada é cortado.

### Abrir e fechar
- Um item aberto por vez. Abrir outro **aplica** o anterior (mesma regra do painel do desenho, R11 do PR #87). **Cancelar** e **Esc** desfazem o que foi mexido desde a abertura.
- Etapa aberta: as **5 perguntas**, no mesmo componente do painel do Desenho (ver "Componentes").
- Escolha ou ao mesmo tempo aberto: a **configuração de bloco existente** (`ConfiguracaoDoBloco`: condições, modo, fim de cada caminho, Testar).

## 3. Mexer na estrutura
- **Incluir:** um **+** aparece entre dois itens ao passar o mouse, e fica sempre visível no fim de cada caminho, ramo e da lista ("+ etapa neste caminho"). Menu: **Etapa · Etapa automática · Escolha · Ao mesmo tempo**. O item novo nasce aberto, com o cursor no nome. Escolha e ao mesmo tempo nascem como no desenho (`novoItem`): a escolha com um caminho pedindo condição, no modo "todos os que servirem" (decisão do PO de 04/10/2026), e "+ outra condição" à mão; o ao mesmo tempo com dois ramos.
- **Remover:** botão **Remover** no item aberto, ou menu ⋯ da linha. Remover escolha ou ao mesmo tempo com conteúdo pede confirmação dizendo o que vai junto ("Remove a escolha e as 3 etapas dos caminhos dela"). O desfazer traz de volta.
- **Arrastar:** alça ⋮⋮ em cada linha. Uma linha verde mostra onde o item cai; dá para entrar e sair de caminhos e ramos. Grupos se movem inteiros. Destino proibido: linha vermelha com o motivo; soltar ali não faz nada. Alternativa sem mouse: **Mover para cima / para baixo** no menu ⋯.
- **Fim de caminho de escolha:** seletor **segue · encerra o processo · volta para…**. O "volta para…" lista só os destinos que o desenho já aceita (`destinosDeVolta`). Dentro de ao mesmo tempo, só **segue**, com a explicação.
- **Caminhos:** "+ outra condição"; ✕ remove um caminho.
- **Vínculo:** o menu ⋯ da etapa oferece as mesmas ações de vínculo do desenho.

## 4. Sincronia com o Desenho
- **Seleção acompanha a troca de aba:** etapa aberta no Roteiro → Desenho com ela selecionada e o painel aberto; e o inverso.
- **Posições no desenho:**
  - item incluído pela lista: posição automática ao lado dos vizinhos (`completarPosicoes`, como hoje);
  - item movido pela lista: **perde a posição antiga** e ganha uma nova perto do novo lugar (evita caixa no lugar antigo com setas cruzando);
  - os demais itens **não se mexem**;
  - item removido leva junto sua posição.
- **Desenho livre com setas** (próximo projeto, especificação própria). Fica combinado: enquanto o desenho couber em blocos, o Roteiro funciona como aqui. Se ficar momentaneamente incompleto, a lista mostra "O desenho tem *N* pendências. Termine as ligações no Desenho para ver o roteiro completo" (pendências clicáveis), as etapas seguem configuráveis, e a edição de estrutura pela lista fica bloqueada com o motivo. **Este projeto não implementa isso**; só deixa o lugar do aviso previsto.

## Componentes
| Unidade | O que faz | Onde |
|---|---|---|
| `PerguntasDaEtapa` | As 5 perguntas da etapa e o "Em resumo", hoje dentro de `process-flow.tsx`. Usado no painel do Desenho e dentro da lista. | `components/processes/perguntas-da-etapa.tsx` (PR 1) |
| `montarRoteiro(fluxo, steps, pendências, …)` | Função pura: dos blocos para as linhas da lista (tipo, profundidade, etiquetas, pendências, fim de caminho). | `lib/roteiro.ts` |
| `podeSoltar(fluxo, itemId, destino)` | Função pura: aplica o movimento numa cópia e roda `validarBlocos`; devolve `{ ok }` ou `{ ok: false, motivo }`. Recusa também mover um grupo para dentro dele mesmo. | `lib/roteiro.ts` |
| `posicoesAoMover(desenho, ids)` | Função pura: tira as posições dos itens movidos (e do conteúdo deles); o resto fica. | `lib/desenho-bpmn.ts` |
| `Roteiro` | A lista: linhas, grupos, + entre itens, arrastar, item aberto. | `components/processes/roteiro/` |
| Prévia | `CanvasBpmn` em modo só olhar: sem arrastar, sem paleta, clique seleciona. | prop nova em `canvas-bpmn.tsx` |
| Seletor de vista | Roteiro / Desenho no topo; Roteiro desabilitado em workflow só leitura. | `desenho-bpmn/topo.tsx` + `process-flow.tsx` |

`process-flow.tsx` (≈2.500 linhas) continua dono do estado. A vista Roteiro recebe por props o estado e as mesmas funções que o desenho recebe.

## Erros e casos de borda
- **Soltar em destino proibido:** nada muda; a linha vermelha mostra o motivo antes de soltar.
- **Remover a última etapa de um caminho:** permitido; o caminho fica vazio e "segue" (como no desenho).
- **Escolha que fica com um caminho só / ao mesmo tempo com um ramo:** as pendências e avisos existentes aparecem no cartão.
- **Etapa vinculada movida ou removida:** mesmas regras de vínculo do desenho (`religarVinculos`).
- **Workflow antigo:** Roteiro desabilitado; abre na vista por raia, como hoje.
- **Nomes de papéis ainda carregando:** as etiquetas mostram "carregando…" em vez de "falta quem faz", para não acusar pendência falsa.

## Testes
- **Automáticos (vitest, lógica pura):**
  - `montarRoteiro`: fluxo linear; escolha com volta e encerramento; ao mesmo tempo com escolha dentro; etapa vinculada; etapa automática; "Senão" antigo; etiquetas de pendência.
  - `podeSoltar`: cada proibição conhecida (encerrar/voltar dentro de ao mesmo tempo; volta que passaria a apontar para frente; grupo para dentro dele mesmo) e destinos válidos.
  - `posicoesAoMover`: só os itens movidos (e seu conteúdo) perdem a posição.
- **No navegador**, contra o workflow real, sempre com a trava que bloqueia gravação e conferência do banco no fim: incluir etapa; incluir escolha com condição e etapa no caminho; arrastar; volta e encerramento; trocar de aba com a seleção acompanhando; desfazer. O PR 1 é conferido abrindo o painel do Desenho e comparando com o atual.

## Fora do escopo
- Desenho livre com setas (próximo projeto).
- Mudanças de visual do Desenho além do seletor de vista.
- Editar posição e raias pela lista.
