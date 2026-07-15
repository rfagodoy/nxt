import js from '@eslint/js'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

/**
 * ESLint 9 (flat config) para a API NestJS. Sem type-aware rules (sem
 * parserOptions.project) → rápido. Filosofia: ERROS bloqueiam, WARNINGS informam;
 * o type-check já cobre tipos.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',        // o TypeScript já garante isso
      'no-unused-vars': 'off',  // usa a versão do @typescript-eslint
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]
