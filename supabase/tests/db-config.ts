// Contenedor Postgres efimero de la suite de base de datos.
export const CONTAINER_NAME = 'fcumple-test-pg-fase1';
export const HOST_PORT = 55433;
export const DATABASE_URL = `postgres://postgres:test@localhost:${HOST_PORT}/postgres`;
