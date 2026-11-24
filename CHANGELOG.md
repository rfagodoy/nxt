# Changelog

As mudanças do Nxt para quem usa o sistema. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/) com codinome por MAJOR. As regras estão em [docs/versionamento.md](docs/versionamento.md).

## [Não lançado]

### Adicionado

- **Código das telas:** cada tela tem um código gerado pelo sistema, com o tipo no prefixo: `TELA_CTR_001` (Contrato), `TELA_PAR_001` (Parceiro) e `TELA_GEN_001` (Genérica). Ele aparece na lista de Telas (a busca também acha por ele), no cadastro da tela e no seletor de telas da atividade. As telas existentes receberam o código na ordem de criação, com as do sistema primeiro.
- **"Usada em":** a lista de Telas mostra em quais workflows cada tela é usada, e o cadastro da tela lista os workflows e as atividades, com link para o editor. Uma tela usada em workflow não pode ser excluída.

### Alterado

- **Telas com o mesmo nome continuam permitidas:** quem identifica a tela é o código. Ao dar a uma tela o nome de outra do mesmo tipo, o cadastro avisa qual é a outra, para diferenciá-las pelo código na atividade. No editor de workflow, a dica da linha de tela do cartão traz o código de cada tela.
- **O tipo da tela fica fixo depois de criada.** Para usar a mesma tela em outro tipo, duplique-a.
- **Configuração de telas mais limpa (opção A do PO, 23/11/2026):**
  - Cada campo tem um estado só, escolhido num clique: Oculto, Só leitura, Editável ou Obrigatório, no lugar das três colunas Aparece, Pode editar e Obrigatório. Número e Título aparecem como obrigatórios, "exigido pelo sistema".
  - Saíram a coluna Tipo (fica na dica do nome), os selos Nativo/Personalizado (o personalizado ganha um ponto ao lado do nome), os contadores e os textos de apoio.
  - Cada seção tem "aplicar a todos"; os blocos do sistema (Partes, Pagamentos, Histórico…) escolhem entre Oculto, Só leitura e Editável. As seções começam fechadas, menos a primeira, e fechadas resumem o que têm ("4 campos · 2 obrigatórios").
  - Tipo da tela, situação, descrição, tela padrão, somente consulta e "Usada em" ficam em "Sobre a tela". Avisos (tela de consulta, campo obrigatório que ninguém preenche) só aparecem quando existem.
- **Escolha da tela na atividade:** cada opção mostra o código primeiro, o nome e o modo (Edição ou 🔒 Consulta), também nas telas adicionais. Se a tela escolhida é de consulta e a atividade cria ou edita o contrato, um aviso aparece logo abaixo, sem impedir; o "Antes de ativar" continua recusando a combinação.
- **Lista de Telas mais limpa:** a descrição saiu da coluna Nome (aparece ao passar o mouse no nome, e a busca continua achando por ela). Nova coluna "Modo", com Edição ou Consulta, e o cadeado da tela do sistema ao lado do código: os nomes ficam alinhados e a lista cabe na tela sem rolar para o lado.

## [2.2.1] — Boole — 2026-11-22

### Alterado

- **Editor de workflow mais fácil de ler (opção A do PO, 22/11/2026):**
  - O cartão da atividade mostra, logo abaixo do nome, quem faz, o prazo e as telas da tarefa: o nome da primeira e "+N" quando há mais. Ao passar o mouse na linha da tela, aparece a lista na ordem da execução, com editar ou consulta. Atividade sem tela mostra "Sem tela".
  - A paleta mostra o nome de cada forma, em grupos: Eventos, Atividades, Decisões, Ligações e Organização. O Fim tem a borda mais grossa que o Início. Recolhida, fica só com os ícones.
  - O nome da raia fica de lado, numa coluna estreita, e o desenho ganha espaço.
  - O nome das escolhas e dos eventos tem fundo, e a seta que passa por baixo não corta mais o texto. O "Sim"/"Não" de uma seta que sai de lado vai para depois do nome.
  - O zoom fica no canto, junto, com o nível em % (clicar volta a 100%) e "Ajustar à tela". Saiu a marca "React Flow".

## [2.2.0] — Boole — 2026-11-22

### Adicionado

- **Coluna "Concluída em" no acompanhamento do processo:** as abas Andamento e Histórico mostram a data e a hora em que cada atividade foi concluída. Atividade pendente, devolvida ou cancelada fica com "—".
- **"Ao concluir, ativa o contrato":** nova marca na atividade. O Concluir confere o que a ativação exige e leva o contrato para Vigente; sem a marca, ele segue em cadastro.
- **Listas curtas viram botões:** campo de lista com até 3 opções aparece como botões em qualquer tela. Dentro de uma tarefa, se o campo decide a escolha logo à frente, a resposta marcada mostra para onde o processo segue.
- **Rolagem lateral nas tabelas:** quando as colunas não cabem na tela, as tabelas mostram a barra de rolagem e deslizam para os lados.

### Alterado

- **Auditoria de UX (22/11/2026), dez ajustes:**
  - **Processos dizem a que se referem.** A coluna "Relativo a" mostra o tipo do processo (Contrato, Aditivo ou Encerramento) e o contrato, com número e contraparte; antes de o contrato existir, diz "Contrato ainda não cadastrado". A coluna "Atividade atual" mostra, só para o processo em andamento, a atividade e com quem está, ou as atividades em paralelo; o processo encerrado mostra "—". A nova coluna "Encerrado em" traz a data de conclusão ou de cancelamento, e o motivo do cancelamento aparece ao passar o mouse no selo "Cancelado". A coluna "Pontualidade" mostra só o estado do processo: no prazo, vence hoje, vence amanhã ou atrasado N dias (o mesmo critério do indicador "Atrasados"). Cancelar e desfazer o cancelamento ficam no menu "⋯", fixo à direita da tabela. As linhas têm altura fixa: o que não cabe termina em "…" e aparece inteiro ao passar o mouse. "Data prevista", "Início" e "Iniciado por" passam para Configurações da lista.
  - **Dashboard:** "vence em breve" conta os próximos 365 dias a partir de hoje, com a data final escrita no cartão. Antes, contratos que venciam no começo do mês do ano seguinte ficavam de fora. Com a caixa de tarefas vazia, ela vira uma linha no topo e os gráficos ganham o espaço.
  - **Cabeçalho do contrato:** faixa com Contratada, Vigência, Valor total (com as parcelas) e Saldo (com o que está vencido). Uma ação principal por situação; Abrir para revisão, Encerrar e Rescindir ficam em "Mais ações", com Encerrar e Rescindir num grupo à parte. Salvar só aparece quando há alteração.
  - **Detalhe e cadastro do contrato no mesmo formato da tarefa:** seções em sanfona, uma embaixo da outra, com o atalho "Ir para" no topo mostrando o que falta. No cadastro, o rodapé com Salvar rascunho e Ativar fica fixo e diz quantos campos faltam para ativar.
  - **Formatos:** real aparece sempre como "R$ 60.000,00"; outras moedas pelo código ("USD 1.200,00"). Datas com ano de quatro dígitos. Valores do Dashboard na fonte do texto.
  - **Mesmos nomes para as mesmas coisas:** "Em cadastro" em contrato e parceiro, "Abrir para revisão" também no parceiro, aba "Pagamentos" (e "Recebimentos"), "Parceiro" no lugar de "Fornecedor" nas Telas. O botão "Fechar" saiu dos documentos: quem fecha é o X da aba.
  - **Relatório de contratos:** tipos pelo nome, colunas Contratada e Contratante (com a unidade, sem repetir), filtros que valem na hora e subtítulo sem linguagem de banco de dados.
  - **Menu:** Tarefas no topo com o número de pendentes. Grupos Gestão, Cadastros de apoio (Estrutura organizacional e Tabelas), Configurações e Sistema, todos com seta; o único número do menu é o de Tarefas. "Instalação" virou "Sistema", e "Notificações" das configurações virou "Regras de aviso".
  - **Listas de configuração:** Telas ocupa a largura toda e tem indicadores que filtram. Em Telas, Usuários e Workflows as ações têm nome ("Editar" e o menu "⋯"). Excluir workflow fica no menu e não existe para workflow ativo.
  - **Página não encontrada** do Nxt, com o menu e caminho de volta, no lugar da página padrão em inglês. Notificações vazia não oferece "Marcar todas como lidas" nem paginação. Com um só workflow para iniciar, o botão diz o nome dele e inicia direto.
- **Tarefa sem abas: telas uma embaixo da outra.** As telas da atividade aparecem empilhadas, na ordem definida no editor, cada uma aberta ou fechada. As de consulta têm aparência de leitura, e um atalho "Ir para" no topo leva a cada tela e mostra quantos obrigatórios faltam. Tela fechada com pendência mostra "falta N" e abre sozinha quando o Concluir esbarra nela.
  - No editor, "Telas da tarefa, nesta ordem" inclui a tela principal, com subir/descer e Aberta/Fechada em cada uma. Workflows existentes continuam na ordem de antes, com tudo aberto.
- **O contrato grava sozinho dentro da tarefa.** Saem Salvar, Ativar, Fechar e o aviso "Contrato aberto para edição"; o topo diz "Salvo às HH:MM". Na criação, o contrato começa a ser salvo assim que Número e Título estão preenchidos. O Concluir grava o que estiver pendente antes de concluir.
- **Filtro de escolha só testa campo garantido:** o workflow não ativa se uma escolha testa um campo do contrato que nenhuma atividade antes dela exige, ou que só é exigido em parte dos caminhos até ela. Vale para campos do sistema e personalizados; a mensagem diz o campo, a escolha e onde marcar. Situação, Prazo indeterminado e "Onde a equipe trabalha" ficam de fora.
- **Campos obrigatórios valem dentro do workflow:** "Concluir tarefa" agora cobra os obrigatórios das telas da atividade e lista pelo nome o que falta. Antes, eles só eram cobrados ao ativar o contrato. Campo oculto, travado ou em tela de consulta não é cobrado.
- **Campos do sistema podem ser obrigatórios nas Telas de Contrato:** a coluna "Obrigatório" passa a valer para campos como "Mão de obra alocada", com asterisco no formulário. Número, Título, Situação e Prazo indeterminado continuam definidos pelo sistema.
- **Acompanhamento do processo no padrão dos documentos:** cabeçalho em cartão com selo ao lado do título e botão Fechar, abas iguais às de contrato e parceiro e tabelas na densidade escolhida.
- **Caminhos paralelos mais simples de desenhar:** dentro de um "ao mesmo tempo", uma atividade sem sucessora é o fim de uma linha paralela, sem losangos para juntar.
  - O processo encerra quando a linha que chega ao Fim termina e não sobra nada aberto. Depois que a linha principal termina, o acompanhamento mostra "Aguardando" com o nome das atividades abertas.
  - Numa linha paralela, se nenhum caminho da escolha servir, só aquela linha acaba: a seta "Não" deixa de ser necessária.
  - Linha paralela só devolve para atividades da própria linha.
  - Várias linhas podem ligar direto no Fim. O losango + de junção só é necessário quando há atividades em comum depois delas.
  - A atividade ganha a marca "fim da linha paralela" no desenho e aparece como aviso em "Antes de ativar". Os workflows com junção desenhada continuam valendo.
- **Volta dentro de um "ao mesmo tempo":** uma escolha pode voltar para uma atividade anterior da mesma frente, como o laço Corrigir → Analisar. Voltar para fora da frente e encerrar o processo dentro dela continuam proibidos.
- **Filtro da escolha:** cada caminho lista também os campos das telas das atividades anteriores à escolha, além das telas das atividades do próprio caminho.
- **Gavetas do editor de workflow no padrão dos cadastros:** atividade, escolha, "ao mesmo tempo", raia, fase, piscinas, mensagem, seta e as demais formas.
  - O resumo virou uma linha discreta embaixo do nome, no lugar do cartão escuro "Em resumo".
  - As perguntas numeradas viraram seções que abrem e fecham. Fechada, cada seção mostra o valor escolhido ou o selo "Falta".
  - Os cartões grandes de opção viraram listas de escolha, com a explicação da opção escolhida logo abaixo.
  - O rodapé diz o que falta pelo nome ("Falta: prazo").
  - Na atividade, abrem a Identificação e a primeira seção incompleta.
  - A seção Prazo tem só o número e a unidade. Os atalhos (4 horas, 1 dia, 2 dias, 5 dias) saíram.
  - A gaveta do **Caminho**, que abre ao clicar numa seta que sai de uma escolha, também segue o padrão: tem as seções Condição e Rótulo no desenho, e Cancelar e Aplicar.
- **O desenho do workflow anda como um mapa:**
  - Arrastar no vazio move o desenho para cima, para baixo e para os lados.
  - A roda do mouse ou o trackpad rolam o desenho (Shift + roda, para os lados).
  - O zoom fica no Ctrl + roda, na pinça do trackpad e nos botões + e −.
  - A seleção de várias formas por laço passa a ser Shift + arrastar. Com Ctrl junto, ela soma à seleção atual.
- **Cabeçalho do editor de workflow mais simples:**
  - Ficam o nome, uma linha de resumo ("Contrato · inicia: Solicitante · Editar"), desfazer, "⋯", Salvar e Ativar.
  - O **Editar** abre a gaveta do workflow, que agora reúne nome, tipo, descrição e quem pode iniciar.
  - Saíram do topo os botões "Sobre", "Quem inicia" e a lista de pendências.
- **"Antes de ativar":** o botão Ativar mostra quantos ajustes faltam e, ao clicar, abre um checklist.
  - Em vez de uma frase longa por problema, há uma linha por assunto, com a contagem (por exemplo, "4 caminhos que não chegam ao Fim").
  - Cada linha mostra os itens, e cada item leva até a forma no desenho.
  - A configuração (tipo e quem pode iniciar) aparece no alto, com "Alterar".
- A escolha de pessoas busca no servidor enquanto você digita, por nome ou e-mail. A lista mostra os primeiros 20 e pede para refinar a busca, para continuar rápida com centenas de usuários.

### Corrigido

- Um usuário recém-cadastrado aparece na hora para ser escolhido como responsável ou parte envolvida, sem precisar recarregar a página.
- Nomes longos em seletores ficam em uma linha, com reticências, em vez de quebrar por cima do que vem depois. Em "Mais opções da tela", os botões descem quando falta espaço.
- Na gaveta do caminho, o campo escolhido no filtro volta a aparecer: as partes da condição quebram linha em vez de espremer o campo.

### Removido

- **Miniatura do desenho do workflow:** saiu, junto com o botão "Miniatura". Agora que arrastar e rolar movem o desenho, ela não faz mais falta. Sem ela, o desenho ganha mais espaço na tela.
- **Botões Horizontal, Vertical, Grade e Organizar do topo do editor:**
  - A orientação das raias continua na gaveta da piscina principal, na seção Desenho.
  - A grade fica sempre ligada.
  - O Organizar, que arrumava o desenho sozinho, foi removido.
- **Ação automática:** toda atividade do workflow é feita por uma pessoa. A ação automática saiu da paleta e do campo "Executada por", que também deixou de existir.
  - Aditivo e encerramento passam a ser registrados numa tarefa com a Tela do contrato, no modo Editar.
  - Processos e workflows ativos que já usam ação automática continuam funcionando.
  - No editor, a ação automática de um desenho antigo mostra um aviso e o botão "Transformar em tarefa de pessoa".

### Segurança

- Dependência do Prisma atualizada para corrigir uma falha de negação de serviço (ReDoS) publicada em 22/11/2026. Nada muda no uso do sistema.

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
