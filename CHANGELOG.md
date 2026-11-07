# Changelog

As mudanças do Nxt para quem usa o sistema. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/) com codinome por MAJOR. As regras estão em [docs/versionamento.md](docs/versionamento.md).

## [Não lançado]

### Alterado

- **Gavetas do editor de workflow no padrão dos cadastros:** atividade, escolha, "ao mesmo tempo", raia, fase, piscinas, mensagem, seta e as demais formas.
  - O resumo virou uma linha discreta embaixo do nome, no lugar do cartão escuro "Em resumo".
  - As perguntas numeradas viraram seções que abrem e fecham. Fechada, cada seção mostra o valor escolhido ou o selo "Falta".
  - Os cartões grandes de opção viraram listas de escolha, com a explicação da opção escolhida logo abaixo.
  - O rodapé diz o que falta pelo nome ("Falta: prazo").
  - Na atividade, abrem a Identificação e a primeira seção incompleta.
  - A gaveta do **Caminho**, que abre ao clicar numa seta que sai de uma escolha, também segue o padrão: tem as seções Condição e Rótulo no desenho, e Cancelar e Aplicar.

## [2.1.0] — Boole — 2026-11-07

### Adicionado

- **Vários Fins no workflow:** cada caminho pode terminar no seu próprio Fim. Dentro de "Ao mesmo tempo", vários Fins continuam sendo recusados.

### Alterado

- **Todo workflow tem tipo:** Contrato, Aditivo ou Encerramento. Um workflow novo nasce como Contrato, e os antigos sem tipo passam a Contrato.
- O aviso na tarefa só aparece quando a raia tem executor padrão e a tarefa usa outro.
- Tarefas sem nada pendente mostram a mesma mensagem discreta da tela de Processos, sem ícone nem emoji.

### Corrigido

- O cadastro de usuário (Novo usuário e Resetar senha) não abre mais com o nome, o e-mail e a senha preenchidos pelo login salvo no navegador.

### Removido

- Da paleta: Início agendado, Início por evento, Envio de mensagem, Recebimento de mensagem, Fim com erro, Fim com cancelamento e Terminar tudo. Desenhos que já os usam continuam abrindo, mas não ativam.
- A opção "— sem tipo" do campo Tipo do workflow.
- Workflow não trata mais de parceiro: as telas de parceiro saem da escolha de tela da atividade, e a ação automática "Ativar parceiro" sai do catálogo. Processos que já usam esses recursos continuam funcionando.

## [2.0.0] — Boole — 2026-11-04

A versão 2 homenageia **George Boole** (1815–1864), matemático inglês que transformou a lógica em álgebra: verdadeiro e falso, "e", "ou" e "não" viraram operações que se calculam. Toda decisão que um computador toma descende do trabalho dele, e por isso o nome combina com uma versão dedicada às regras e aos fluxos de aprovação.

### Adicionado

- **Editor de workflow no estilo Bizagi:**
  - paleta em grade com Início, Tarefa, Escolha, Ao mesmo tempo e Fim, com as variações de cada um no ▾ e as etiquetas "Executa hoje" e "Próxima rodada";
  - ao selecionar uma forma, a coluna ao lado oferece o próximo item (Tarefa, Escolha, Ao mesmo tempo ou Fim), que entra já ligado;
  - um clique seleciona, e o duplo clique abre a parametrização de qualquer elemento: tarefa, losango, evento, seta, raia, fase, piscina e fluxo de mensagem;
  - fases dividem o desenho em etapas do processo;
  - piscinas de participantes externos, ligadas ao processo por fluxo de mensagem;
  - o desenho pode ficar na horizontal ou na vertical;
  - grade, guias de alinhamento e seleção por laço, com alinhar e distribuir. A tarefa pode ser redimensionada;
  - a raia tem um executor padrão, que as tarefas desenhadas nela herdam até alguém escolher outro;
  - setas com ponta livre: ao selecionar uma seta, cada ponta pode ser arrastada para qualquer ponto do contorno da forma, e "Caminho automático" volta ao traçado de sempre;
  - as setas comuns ganham rótulo;
  - elementos da próxima rodada (como temporizador e subprocesso) podem ser desenhados e salvos em rascunho. A ativação explica que eles ainda não executam.

### Alterado

- **Gavetas do editor no mesmo padrão:** chip com o tipo, "Em resumo" em uma frase, perguntas numeradas e rodapé com Remover, Cancelar e Aplicar. A Escolha mostra cada caminho inteiro, com a condição, o destino, Editar e Remover.
- A Escolha da paleta segue "o primeiro que servir". "Todos os que servirem" fica na gaveta da Escolha.
- O aviso de que um workflow ativo volta a rascunho considera o executor que a tarefa herda da raia.
- **Menu do usuário** reorganizado em seções:
  - a conta fica no topo;
  - em "Suas preferências", o tema vira uma linha com a cor e o nome atuais;
  - a lista completa de temas abre ao lado, separada em Claros e Escuros e com os nomes inteiros;
  - a densidade mostra o espaçamento de cada opção;
  - Sair e a versão dividem o rodapé.

### Removido

- O Roteiro e a vista "Ver por raia" saíram. O editor é só o desenho.

## [1.1.1] — Ada — 2026-10-31

### Corrigido

- **Papéis:**
  - uma etapa cujo papel foi apagado mostra "Papel removido — escolha outro" em vez de "carregando…" para sempre, e deixa de contar como completa;
  - se a leitura dos papéis falhar (sem rede, ou erro do servidor), o sistema não grava mais a lista padrão por cima da lista real, nem acusa papel removido.
- **Roteiro:**
  - a alça de arrastar funciona pelo teclado: ↑/↓ movem a etapa, inclusive para dentro e para fora dos caminhos, e Enter/Espaço abrem o menu;
  - o menu ganhou "Mover para…" outro caminho;
  - o leitor de tela anuncia o novo lugar.
- Remover um caminho pelo painel da escolha promove a cópia vinculada da etapa, no Desenho como no Roteiro.
- Textos: "1 ramo" no singular, frente única com frase própria e "+ Primeira etapa" num workflow vazio.
- Frase mais clara quando parte do desenho está danificada.

## [1.1.0] — Ada — 2026-10-31

### Adicionado

- **Roteiro:** nova vista do editor de workflow que mostra o processo como uma lista, na ordem em que acontece, com o desenho ao lado. Etapas, escolhas e caminhos se configuram, incluem, removem e movem pela própria lista. O editor abre no Roteiro, e trocar de vista com o Desenho não perde nada.
- **Desenho livre:** no Desenho, qualquer seta pode ser apagada e qualquer forma ligada a qualquer outra. O desenho passa a ser a fonte do workflow. O que ainda não forma um fluxo válido vira pendência com as formas e setas em destaque, e a ativação só aceita o que o motor executa. Com o desenho incompleto, o Roteiro mostra o aviso e as etapas continuam configuráveis.
- **Temas:** Nxt-Claro e Nxt-Escuro, mais seis (Porcelana, Oceano, Cerrado, Meia-noite, Grafite e Alto contraste). O tema é uma preferência do usuário, vale em qualquer computador e cobre o sistema inteiro: login, dashboard, desenho do workflow e exportações.
- **Dashboard:** os cartões vazios mostram o gráfico em tracejado, com uma frase e um botão para a próxima ação.
- **Editor BPMN:** arrastar uma etapa abre espaço no destino e fecha na origem, com prévia ao vivo. Exportar gera o que está na tela.

### Alterado

- Fundo do shell em #EEF2EF (paleta "Neutro calmo"), com o degradê da marca mais suave.
- Arrumar só o desenho (mover formas, raias, renomear) não devolve um workflow ativo a rascunho.
- Uma etapa que não leva ao Fim impede a ativação.
- Cursor visível no desenho: seta no vazio, cursor de mover sobre o que se arrasta.

### Corrigido

- Um workflow ativo não grava mais sozinho ao sair do editor. O editor pergunta antes: Salvar rascunho, Continuar editando ou Descartar.
- Com o Roteiro aberto, exportar gera o desenho BPMN, e não a vista por raia.
- Desenho livre:
  - um losango de passagem antes de um laço é aceito;
  - uma escolha cujos caminhos todos encerram mostra as etapas seguintes como inalcançáveis, sem travar o Roteiro;
  - a ativação recusa um desenho ilegível, em vez de usar os blocos antigos, e destaca as formas e setas culpadas;
  - dois "Senão" no mesmo losango viram pendência;
  - um losango sem efeito não some quando se usa o Roteiro.

## [1.0.0] — Ada — 2026-10-31

Primeira versão numerada do Nxt. Ela reúne o que foi entregue até aqui (PRs #1 a #89), antes publicado em tags por data (a última foi `v2026.10.18.6`).

> **Ada Lovelace (1815–1852)** escreveu, para a Máquina Analítica de Charles Babbage, o que hoje é considerado o primeiro programa de computador. Também foi das primeiras a perceber que uma máquina de calcular podia manipular qualquer símbolo, não só números. O codinome marca o primeiro produto completo do Nxt: o ponto de partida.

### Adicionado

- **Contratos:** cadastro dirigido por telas configuráveis, com campos personalizados e mão de obra alocada. Reajuste pela data-base, numeração atômica, histórico e alertas de vencimento por e-mail. Lista em estilo planilha, com busca, filtro e ordenação no servidor.
- **Parceiros:** cadastro com preenchimento por CEP e por CNPJ (cartão da Receita), campos personalizados obrigatórios por tipo, filtro e exportação.
- **Telas:** campos do contrato montados numa matriz, telas em abas e duplicação de tela.
- **Workflows:** motor BPMN executável. Editor em blocos e em desenho BPMN, com escolhas por condição sobre os dados das telas, frase viva e "Testar decisão". Etapa configurada por perguntas, papéis e responsáveis, devolver e retroceder, frentes em paralelo, encadeamento de processos e ativação com pendências claras.
- **Processos e tarefas:** acompanhamento ao vivo, SLA e gargalos, caixa de tarefas, delegação, notificações, cancelamento que desfaz o que o processo fez no contrato, e calendário comercial.
- **Dashboard** de gestão em uma tela, com Visão geral, Vencimentos e Concentração, atualizado em tempo real junto com as listas e o sino.
- **Administração:** organograma, usuários e papéis (RBAC), hub de Tabelas, relatórios, importação de planilha, configuração de e-mail com senha cifrada, backup agendado com cópia externa e restauração provada.
- **Interface:** shell em ilhas de vidro, faixa única no topo, densidade por usuário e modos claro e escuro.

### Segurança

- Recuperação de senha, trilha de auditoria e mutações de configuração restritas a administradores.
- Dependências sem nenhum alerta alto ou crítico, com portão de auditoria no CI (`follow-redirects` 1.16.2).

[Não lançado]: https://github.com/rfagodoy/nxt/compare/v2.0.0-boole...HEAD
[2.0.0]: https://github.com/rfagodoy/nxt/compare/v1.1.1-ada...v2.0.0-boole
[1.1.1]: https://github.com/rfagodoy/nxt/compare/v1.1.0-ada...v1.1.1-ada
[1.1.0]: https://github.com/rfagodoy/nxt/compare/v1.0.0-ada...v1.1.0-ada
[1.0.0]: https://github.com/rfagodoy/nxt/releases/tag/v1.0.0-ada
