import { FlatCompat } from '@eslint/eslintrc'
import tsPlugin from '@typescript-eslint/eslint-plugin'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

/**
 * ESLint 9 (flat config). Filosofia: ERROS bloqueiam, WARNINGS informam.
 * O type-check já cobre tipos, então aqui focamos no que ele não pega
 * (regras de hooks, código morto) sem afogar o código existente.
 * O `@typescript-eslint` é registrado aqui porque o next/core-web-vitals não o inclui.
 */
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**'] },
  // diretivas eslint-disable "no-explicit-any" ficaram redundantes (a regra está off) — não reportar
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      // react-hooks/rules-of-hooks continua ERRO (pega bug de verdade)
    },
  },
]

export default config
