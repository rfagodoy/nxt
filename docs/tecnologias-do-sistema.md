# As tecnologias do sistema Nxt — explicado para qualquer pessoa

> Este documento explica, **sem jargão técnico**, quais "peças" formam o sistema Nxt, por que escolhemos cada uma, e como elas se comparam com tecnologias famosas como o **Java**. A ideia é que qualquer pessoa — mesmo sem conhecer programação — entenda as decisões.

---

## Uma analogia para começar

Pense no sistema como um **prédio inteligente**:

- A **fachada e os ambientes** onde as pessoas circulam (telas, botões, formulários) = o **frontend**.
- A **parte de máquinas e tubulação** que ninguém vê, mas faz tudo funcionar (regras, cálculos, segurança) = o **backend**.
- O **arquivo central** onde tudo fica guardado (contratos, parceiros, unidades) = o **banco de dados**.
- A **portaria** que controla quem entra = a **autenticação**.

Cada uma dessas partes usa uma tecnologia. Vamos por partes.

---

## A decisão mais importante: **uma língua só do começo ao fim**

A escolha central do nosso sistema é usar **uma única linguagem de programação — o TypeScript — tanto na fachada quanto nas máquinas**.

**Por que isso importa (em linguagem simples):** é como ter uma equipe em que **todos falam o mesmo idioma**, do porteiro ao engenheiro. As pessoas conversam sem tradutor, trocam de função facilmente, e há menos mal-entendidos. Na maioria dos sistemas tradicionais, a fachada fala uma língua e as máquinas falam outra — o que exige dois times separados e gera mais erros na "tradução" entre eles.

**Vantagem prática:** entregamos novas funcionalidades **mais rápido**, com **menos bugs de comunicação** entre as partes, e com **um time menor** — o que é decisivo para um produto que está crescendo.

---

## As peças principais (o que é, por que escolhemos, e como se compara)

### 1. A linguagem: **TypeScript**
- **O que é:** a "língua" em que o sistema é escrito. É o JavaScript (a linguagem da web) com uma camada extra de **segurança e organização**.
- **Por que escolhemos:** ela avisa o programador sobre erros **antes** de o sistema rodar (como um corretor ortográfico que pega problemas enquanto você digita), e serve tanto para a fachada quanto para as máquinas.
- **Comparação com Java/outras:** o **Java** é uma linguagem excelente e robusta, mas obriga a ter **duas línguas** no projeto (Java nas máquinas + JavaScript na fachada). Além disso, o Java costuma ser mais **verboso** (precisa escrever mais para fazer o mesmo). O TypeScript nos dá segurança parecida com a do Java, porém com **mais agilidade** e uma língua única.

### 2. A fachada (o que você vê): **React + Next.js**
- **O que é:** as ferramentas que montam as **telas** — botões, abas, formulários, tabelas, o tema claro/escuro.
- **Por que escolhemos:** são o **padrão de mercado** para construir interfaces modernas e rápidas. Quase todo site grande que você usa (de bancos a streamings) é feito com React.
- **Comparação:** alternativas mais antigas (como telas geradas direto pelo Java, ou tecnologias como JSF) tendem a ser **menos fluidas e mais datadas**. Com React/Next.js conseguimos a experiência ágil de "aplicativo", como o usuário espera hoje.

### 3. As máquinas (o que faz funcionar): **Node.js + NestJS**
- **O que é:** o **motor** que recebe os pedidos das telas, aplica as regras de negócio, conversa com o banco e devolve as respostas. **Node.js** é o motor; **NestJS** é a "planta organizada" que dá estrutura profissional a ele.
- **Por que escolhemos:** o NestJS organiza o sistema de forma **modular e profissional** (muito parecido com o que o mundo Java faz com o **Spring**), mas rodando na nossa língua única. O Node.js é especialmente bom em **atender muitas pessoas ao mesmo tempo** sem travar.
- **Comparação com Java/Spring:** o **Spring (Java)** é maduro e poderoso — não é pior. A diferença é de **trade-off**: o caminho Java costuma exigir mais infraestrutura (a "máquina virtual Java"), mais código repetitivo e um ciclo de desenvolvimento mais lento. O nosso caminho entrega **mais velocidade** com qualidade comparável, e mantém a língua única.

### 4. O arquivo central: **SQL Server**
- **O que é:** o **banco de dados** — onde ficam guardados, com segurança, todos os contratos, parceiros, unidades, configurações.
- **Por que escolhemos:** é um banco **corporativo, robusto e confiável**, da Microsoft, **amplamente usado em empresas** — inclusive nas mais tradicionais. Isso facilita muito a venda para clientes grandes, especialmente os que instalam o sistema na própria infraestrutura.
- **Comparação:** está no mesmo nível dos bancos mais respeitados do mercado (como Oracle e PostgreSQL). A escolha pelo SQL Server foi por **alinhamento com o ambiente das empresas-alvo**.

### 5. A "ponte" para o banco: **Prisma**
- **O que é:** a ferramenta que deixa o sistema **conversar com o banco de forma segura e organizada**, sem precisar escrever comandos de banco "na mão" o tempo todo.
- **Por que escolhemos:** reduz drasticamente um tipo comum de erro (comandos de banco mal escritos) e acelera o desenvolvimento, sempre com a tal **segurança** de avisar problemas antes de rodar.
- **Comparação:** no mundo Java existe equivalente (Hibernate). O Prisma é considerado **mais moderno e produtivo** no nosso ecossistema.

### 6. O acabamento visual: **Tailwind + Radix**
- **O que é:** as ferramentas que dão o **visual consistente** (cores, espaçamentos, sombras) e os **componentes acessíveis** (menus, caixas de diálogo, abas).
- **Por que escolhemos:** permitem construir um visual **bonito e padronizado rapidamente**, e cuidam de **acessibilidade** (uso por leitores de tela, navegação por teclado) — algo importante para clientes corporativos.

### 7. A portaria (segurança de acesso): **Keycloak** *(em revisão)*
- **O que é:** o sistema de **login e controle de acesso**.
- **Observação honesta:** hoje usamos o **Keycloak**, mas ele é "pesado demais" para instalações on-premise. Já está no plano **simplificar isso** para um login próprio, mais leve, especialmente para clientes que instalam o sistema na própria casa.

### 8. Os bastidores (organização e ambiente): **Docker + Turborepo**
- **O que é:** **Docker** empacota o banco e os serviços para que rodem igualzinho em qualquer máquina (sem o clássico "na minha máquina funciona"). **Turborepo** organiza e acelera a construção de todas as partes do projeto juntas.
- **Por que escolhemos:** dão **previsibilidade** e **rapidez** no dia a dia da equipe.

---

## "Mas e o Java? Não seria mais 'sério'?" — a resposta honesta

Essa é a pergunta mais comum, e merece franqueza:

**O Java NÃO é pior.** É uma das tecnologias mais maduras e respeitadas do mundo, usada por bancos e grandes corporações. Quem diz que "Node não é coisa séria" está com uma informação **desatualizada** — Netflix, PayPal, LinkedIn, Uber e muitas fintechs rodam exatamente a nossa tecnologia em escala gigante.

A escolha entre um e outro é de **encaixe**, não de "melhor ou pior":

| Critério | Nossa escolha (TypeScript/Node) | Java |
|---|---|---|
| **Velocidade de entrega** | Mais rápida (língua única, menos código repetitivo) | Mais lenta (mais cerimônia/boilerplate) |
| **Times** | Ótimo para times enxutos e ágeis | Brilha em times muito grandes |
| **Idiomas no projeto** | **Um só** (do começo ao fim) | Dois (Java + JavaScript na tela) |
| **Maturidade/robustez** | Alta | Altíssima (referência histórica) |
| **Melhor cenário** | Produto crescendo rápido, SaaS, time pequeno-médio | Sistemas legados enormes, casas Java consolidadas |

**Resumo:** para um produto como o Nxt — que precisa **evoluir rápido**, ser vendido como **serviço na nuvem (SaaS)** e também **instalado na empresa do cliente**, com um time ágil — a nossa escolha entrega **mais rapidez com qualidade equivalente**. Se um dia um cliente específico **exigir** Java por política interna, isso se avalia caso a caso; mas mudar tudo "porque Java parece mais sério" seria trocar velocidade real por uma percepção.

---

## Lista completa das tecnologias (referência rápida)

| Tecnologia | Em uma frase |
|---|---|
| **TypeScript** | A língua única do sistema, segura e organizada |
| **React** | Constrói as telas (a parte que o usuário vê) |
| **Next.js** | A "moldura" que organiza e dá performance às telas |
| **Node.js** | O motor que roda as máquinas (backend) |
| **NestJS** | Dá estrutura profissional ao backend (como o Spring no Java) |
| **Prisma** | A ponte segura entre o sistema e o banco de dados |
| **SQL Server** | O banco de dados corporativo (Microsoft) |
| **Tailwind CSS** | O sistema de estilo visual (cores, espaçamentos) |
| **Radix UI** | Componentes acessíveis (menus, diálogos, abas) |
| **lucide-react** | Os ícones do sistema |
| **React Hook Form + Zod** | Montagem e validação de formulários |
| **Recharts** | Os gráficos (ex.: do painel inicial) |
| **bpmn-js** | Desenho de fluxos de processos (BPMN) |
| **ExcelJS** | Exportação de dados para Excel |
| **date-fns** | Manipulação de datas |
| **Keycloak** *(em revisão)* | Login e controle de acesso |
| **Docker** | Empacota os serviços para rodarem igual em qualquer lugar |
| **Turborepo** | Organiza e acelera a construção do projeto inteiro |
| **AWS S3 / R2** | Armazenamento de arquivos (anexos de contratos) |

---

## Fechamento honesto

Nenhuma tecnologia é "bala de prata". A nossa escolha foi feita com um objetivo claro: **entregar um produto rico e moderno com rapidez**, atendendo tanto nuvem quanto instalação local, com um time eficiente. As tecnologias aqui são **maduras, populares e usadas por empresas do mundo todo** — e foram combinadas para **maximizar velocidade sem abrir mão de qualidade e segurança**.

*Documento gerado para fins de comunicação não-técnica. As escolhas podem evoluir conforme o produto e os clientes.*
