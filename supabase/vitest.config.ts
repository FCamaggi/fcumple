/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// Separate Vitest project for the database test suite: runs against a real,
// ephemeral Postgres container (see tests/globalSetup.ts), not jsdom, so it
// is kept independent from the frontend's vite.config.ts test setup.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['supabase/tests/**/*.test.ts'],
    globalSetup: ['supabase/tests/globalSetup.ts'],
    // RLS + RPC tests share one long-lived container/connection; running
    // them serially keeps role-switching (`asRole`) and singleton-row
    // assumptions (event_config) free of cross-test races.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
