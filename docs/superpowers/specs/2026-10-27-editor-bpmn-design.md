# Editor de workflow em desenho BPMN (estilo Bizagi) — especificação

**Data:** 27/10/2026 · **Decisões do PO:** conversa de 27/10/2026 · **Mockups:** https://claude.ai/artifact/992ebjPWc4E7jFLKUnEwZ2 (linha "Desenho BPMN no estilo Bizagi")

## Objetivo
Trocar o editor de workflow (hoje: trilho de blocos "Montar" + desenho por raia só de leitura) por um **desenho BPMN com caixinhas, losangos, setas e raias**, no estilo do Bizagi, que **não deixa montar um fluxo que trave o motor**.

## Decisões
| Tema | Decisão |
|---|---|
| Forma de editar | Só o desenho. A lista de etapas (trilho "Montar") **sai**. |
| Posição das formas | **Livre**: a pessoa posiciona; botão **"Organizar"** arruma tudo. Posição é gravada. |
| Raias | **Só visuais** (organizam o desenho). Quem executa é definido na gaveta. |
| Raia × responsável | **Aviso discreto** na tarefa quando a raia não bate com o responsável. Nunca impede. |
| Formas da paleta | Só o que o motor executa: **Tarefa, Automática, Escolha, Ao mesmo tempo** + **Raia**. (Início e Fim já existem e são únicos.) |
| Reencontro | **Automático**: soltar Escolha / Ao mesmo tempo cria a divisão e o reencontro já ligados. |
| Ligações | Setas nascem da ordem das etapas. Seta desenhada à mão só onde o modelo permite: **voltar** (de um caminho de escolha para uma tarefa anterior) e **encerrar** (para o Fim). O resto é recusado na hora, com o motivo escrito. |
| Configurar | **Gaveta lateral** com as perguntas do modal da etapa (PR #86) e o "Em resumo"; escolha / ao mesmo tempo usam o inspetor de bloco existente na gaveta. |
| Topo | Uma linha: voltar · nome · Sobre · Quem inicia · saúde · desfazer/refazer · Organizar · ⋯ (Histórico, Exportar, Ver por raia) · Salvar rascunho · Ativar. |
| Biblioteca | **React Flow** (`@xyflow/react`, MIT). |
| Entrega | **Um PR só**. |

## Invariantes
- `FluxoBlocos` continua sendo a **fonte da verdade** da autoria; o grafo, o BPMN e o motor seguem gerados dele (`blocosParaGrafo`). O desenho é uma **projeção** do fluxo + posições.
- Nada muda no banco: o desenho mora em `formSchema.desenho` (JSON).
- Workflows já salvos abrem sem conversão; sem `desenho`, abrem **organizados** e com raias sugeridas pelos responsáveis.
- Workflow antigo que não cabe em blocos continua abrindo **só para leitura** na vista por raia atual.
- Identidade Nxt (Forest Ink, Lime Spark, Esmeralda; Manrope + Space Mono), temas claro e escuro, densidade do usuário na gaveta.
