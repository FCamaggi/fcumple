/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Suite de base de datos de la Fase 1 (esquema multi-tenant). Corre contra un
// Postgres real y efimero (ver tests/globalSetup.ts), independiente de la
// suite de la Fase 0.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['supabase/tests/**/*.test.ts'],
    globalSetup: ['supabase/tests/globalSetup.ts'],
    // Todos los archivos comparten un contenedor y cada uno reinicia el
    // esquema en su beforeAll: tienen que correr en serie.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
