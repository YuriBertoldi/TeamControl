/**
 * Configuração dos testes.
 *
 * `jsdom` porque três módulos de dados persistem em `localStorage` — cadastro,
 * ciclos e DNA. Testá-los com um dublê de localStorage escrito à mão esconderia
 * justamente os erros de serialização, que é onde o bug mora.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Os testes de dados são puros e rápidos; não há setup global de propósito.
    globals: false,
  },
});
