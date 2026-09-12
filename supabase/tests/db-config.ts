// Shared constants for the ephemeral Postgres container used by the DB test suite.
// Both globalSetup.ts (which starts/stops the container) and the test files
// (which connect to it) import from here so the connection details never drift.
export const CONTAINER_NAME = 'fcumple-test-pg';
export const HOST_PORT = 55432;
export const DATABASE_URL = `postgres://postgres:test@localhost:${HOST_PORT}/postgres`;
