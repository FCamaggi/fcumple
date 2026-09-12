import { execSync, spawnSync } from 'node:child_process';
import { Client } from 'pg';
import { CONTAINER_NAME, DATABASE_URL, HOST_PORT } from './db-config';

async function waitForPg(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    const client = new Client({ connectionString: DATABASE_URL });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch (err) {
      lastError = err;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Postgres container did not become ready in time: ${String(lastError)}`);
}

export default async function setup() {
  // Clean up any leftover container from a previous crashed run.
  spawnSync('docker', ['rm', '-f', CONTAINER_NAME]);

  execSync(
    `docker run --rm -d --name ${CONTAINER_NAME} -p ${HOST_PORT}:5432 -e POSTGRES_PASSWORD=test postgres:16-alpine`,
    { stdio: 'inherit' },
  );

  await waitForPg();

  return async () => {
    spawnSync('docker', ['rm', '-f', CONTAINER_NAME]);
  };
}
