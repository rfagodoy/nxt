# Versionamento do Nxt

O Nxt segue **SemVer** (`MAJOR.MINOR.PATCH`). Cada versão MAJOR recebe o **codinome** de um pioneiro da computação. MINOR e PATCH mantêm o codinome da MAJOR: 1.0.0, 1.1.0 e 1.1.2 são todas "Ada".

O número é a identificação principal; o codinome é identidade.

## Quando subir cada número

| Parte | Quando | Exemplo |
|---|---|---|
| **MAJOR** | Mudança incompatível, quebra de API ou grande reformulação do sistema | 1.4.2 → 2.0.0 |
| **MINOR** | Funcionalidade nova, compatível com o que já existe | 1.0.0 → 1.1.0 |
| **PATCH** | Correções e ajustes, sem funcionalidade nova | 1.1.0 → 1.1.1 |

Se os commits desde a última versão não deixam claro qual é o incremento, **pergunte ao PO** antes de gerar a versão.

## Codinomes

A ordem manda: nunca pule, reordene ou reutilize um codinome. O foco indicado é só inspiração e não obriga o conteúdo da versão.

| MAJOR | Codinome | Homenageado | Inspiração |
|---|---|---|---|
| 1 | **Ada** | Ada Lovelace | MVP |
| 2 | **Boole** | George Boole | Regras e fluxos de aprovação |
| 3 | **Codd** | Edgar F. Codd | Relatórios e dados |
| 4 | **Dijkstra** | Edsger W. Dijkstra | Otimização de workflows |
| 5 | **Engelbart** | Douglas Engelbart | Interface e experiência |
| 6 | **Hopper** | Grace Hopper | Automações |
| 7 | **Jacquard** | Joseph-Marie Jacquard | |
| 8 | **Kilby** | Jack Kilby | |
| 9 | **Leibniz** | Gottfried Leibniz | |
| 10 | **McCarthy** | John McCarthy | Inteligência artificial |
| 11 | **Neumann** | John von Neumann | |
| 12 | **Pascal** | Blaise Pascal | |
| 13 | **Ritchie** | Dennis Ritchie | |
| 14 | **Shannon** | Claude Shannon | Notificações e comunicação |
| 15 | **Turing** | Alan Turing | Segurança e assinatura digital |
| 16 | **Wirth** | Niklaus Wirth | |
| 17 | **Zuse** | Konrad Zuse | |

## Nomes

- **Tag Git:** `vMAJOR.MINOR.PATCH-codinome`, codinome em minúsculas: `v1.0.0-ada`, `v1.1.0-ada`, `v2.0.0-boole`.
- **Título da release:** `Versão MAJOR.MINOR — Codinome` (`Versão 1.1 — Ada`). Em PATCH, o número completo: `Versão 1.0.1 — Ada`.
- **Menu do usuário:** mostra a versão do build a partir da tag (`git describe`), formatada como `1.1.0 — Ada`. Um build fora de uma tag mostra também quantos commits passou dela.

As tags antigas por data (`v2026.10.18.6` e anteriores) ficam como histórico. A primeira versão SemVer é a **1.0.0 — Ada** (31/10/2026).

## Onde fica a versão

- `version` no `package.json` da raiz **e** de todos os workspaces (`apps/*`, `packages/*`), sempre iguais.
- `CHANGELOG.md` na raiz, no formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), em português.

## Como gerar uma versão

1. **Ler a versão atual:** `version` do `package.json` e a última tag (`git describe --tags --abbrev=0 --match "v[0-9]*.[0-9]*.[0-9]*-*"`).
2. **Analisar os commits** desde a última tag (`git log <tag>..master --oneline`) e propor o incremento (MAJOR, MINOR ou PATCH), com o motivo.
3. **Atualizar a versão** em todos os `package.json` de uma vez, sem criar tag:
   `npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version`
4. **CHANGELOG.md:** nova seção `## [X.Y.Z] — Codinome — AAAA-MM-DD`, com as subseções do Keep a Changelog (Adicionado, Alterado, Corrigido, Removido, Segurança) escritas para quem usa o sistema.
5. **Em uma MAJOR nova:** um parágrafo curto sobre o homenageado no CHANGELOG e nas notas da release.
6. **Commit e tag locais.** Como o master é protegido, a mudança entra por PR; depois do merge, a tag vai no commit do master:
   `git tag -a vX.Y.Z-codinome -m "Versão X.Y — Codinome"`.
   **Não envie** (`git push --tags`, `gh release create`) sem confirmação do PO.
