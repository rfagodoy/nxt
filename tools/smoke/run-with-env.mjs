/* Roda um script deste diretório com o DATABASE_URL do apps/api/.env carregado.
   (O Prisma standalone não enxerga o .env do app; isto evita repetir o boilerplate.)
   Uso: node tools/smoke/run-with-env.mjs <script.mjs> */
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'

const line = readFileSync('apps/api/.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
if (!line) throw new Error('DATABASE_URL não encontrado em apps/api/.env')
const env = { ...process.env, DATABASE_URL: line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '') }

const target = process.argv[2]
if (!target) throw new Error('informe o script a rodar')
execFileSync(process.execPath, [target, ...process.argv.slice(3)], { stdio: 'inherit', env })
