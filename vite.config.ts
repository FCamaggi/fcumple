/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^konva$/,
        replacement: 'konva/lib/index.js',
      },
    ],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    server: {
      deps: {
        inline: ['konva', 'react-konva'],
      },
    },
    // supabase/tests runs against a real Postgres via `npm run test:db`
    // (supabase/vitest.config.ts), not under this jsdom config.
    exclude: ['node_modules/**', 'supabase/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/mocks/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
});
