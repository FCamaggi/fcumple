// Contenedor Postgres efimero de la suite de la Fase 1. Distinto nombre y
// puerto que el de la Fase 0 (supabase/tests/db-config.ts) para que ambas
// suites puedan correr a la vez.
export const CONTAINER_NAME = 'fcumple-test-pg-fase1';
export const HOST_PORT = 55433;
export const DATABASE_URL = `postgres://postgres:test@localhost:${HOST_PORT}/postgres`;
