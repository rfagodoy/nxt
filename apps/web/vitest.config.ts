import { defineConfig } from 'vitest/config'
import path from 'node:path'

/** Testes de LÓGICA PURA do front (sem React/DOM): resolvem o alias `@` para src. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
