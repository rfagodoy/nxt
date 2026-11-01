# Changelog

As mudanças do Nxt para quem usa o sistema. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/) com codinome por MAJOR. As regras estão em [docs/versionamento.md](docs/versionamento.md).

## [Não lançado]

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

[Não lançado]: https://github.com/rfagodoy/nxt/compare/v1.1.1-ada...HEAD
[1.1.1]: https://github.com/rfagodoy/nxt/compare/v1.1.0-ada...v1.1.1-ada
[1.1.0]: https://github.com/rfagodoy/nxt/compare/v1.0.0-ada...v1.1.0-ada
[1.0.0]: https://github.com/rfagodoy/nxt/releases/tag/v1.0.0-ada
