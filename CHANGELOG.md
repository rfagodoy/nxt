# Changelog

As mudanças do Nxt para quem usa o sistema. Formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões em [SemVer](https://semver.org/lang/pt-BR/) com codinome por MAJOR. As regras estão em [docs/versionamento.md](docs/versionamento.md).

## [Não lançado]

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
- Dependências sem nenhum alerta alto ou crítico, com portão de auditoria no CI.

[Não lançado]: https://github.com/rfagodoy/nxt/compare/v1.0.0-ada...HEAD
[1.0.0]: https://github.com/rfagodoy/nxt/releases/tag/v1.0.0-ada
