import { defineConfig } from 'vitest/config'

/** Roda apenas os testes da FONTE (evita pegar a versão compilada em dist/). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
