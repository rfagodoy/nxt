/* Roda um script deste diretório com o DATABASE_URL do apps/api/.env carregado.
   (O Prisma standalone não enxerga o .env do app; isto evita repetir o boilerplate.)
   Uso: node tools/smoke/run-with-env.mjs <script.mjs>

   O caminho do .env sai da localização DESTE arquivo, não do cwd de quem chamou: com
   caminho relativo, rodar o mesmo comando de dentro de apps/ falhava com ENOENT sem
   dizer por quê. E o ambiente vence o arquivo — no servidor não existe apps/api/.env,
   e insistir nele impediria a ferramenta de rodar lá. */
import { readFileSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ENV_FILE = process.env.NXT_ENV_FILE || join(RAIZ, 'apps', 'api', '.env')

let doArquivo
if (existsSync(ENV_FILE)) {
  const line = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
  if (line) doArquivo = line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '')
}

const DATABASE_URL = process.env.DATABASE_URL || doArquivo
if (!DATABASE_URL) {
  console.error(`DATABASE_URL não encontrada — nem no ambiente, nem em ${ENV_FILE}.`)
  console.error('Exporte a variável ou aponte outro arquivo com NXT_ENV_FILE=<caminho>.')
  process.exit(1)
}

const env = { ...process.env, DATABASE_URL }

const target = process.argv[2]
if (!target) throw new Error('informe o script a rodar')
/* o alvo é resolvido contra o cwd de QUEM chamou (é o que a pessoa digitou), mas roda
   ancorado na raiz — é de lá que os smokes esperam enxergar o repositório. */
execFileSync(process.execPath, [resolve(process.cwd(), target), ...process.argv.slice(3)], {
  stdio: 'inherit', env, cwd: RAIZ,
})
