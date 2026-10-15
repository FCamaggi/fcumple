// Genera supabase/setup-fase-1.sql: un solo archivo para pegar en el SQL Editor
// de Supabase que (1) poda la Fase 0, (2) aplica TODAS las migraciones de la
// Fase 1 en orden y (3) las registra en el historial, todo en una transaccion.
//
// Es un artefacto generado: se regenera con `npm run build:setup-sql` cada vez
// que cambia una migracion, y un test falla si el archivo quedo desactualizado.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(root, 'supabase', 'migrations');
const PRUNE_FILE = path.join(root, 'supabase', 'legacy-fase-0', 'prune-fase-0.sql');
export const OUTPUT_FILE = path.join(root, 'supabase', 'setup-fase-1.sql');

export function buildSetupSql() {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // El script de poda trae su propio begin/commit; aqui todo va en UNA transaccion.
  const prune = readFileSync(PRUNE_FILE, 'utf-8')
    .split('\n')
    .filter((line) => !['begin;', 'commit;'].includes(line.trim()))
    .join('\n')
    .trim();

  const versions = migrations.map((f) => `('${f.split('_')[0]}')`).join(', ');

  const parts = [
    `-- =============================================================================
-- setup-fase-1.sql  --  ARCHIVO GENERADO (npm run build:setup-sql); no editar a mano
-- =============================================================================
-- Pegar COMPLETO en el SQL Editor de Supabase y ejecutar UNA vez. Hace, en una
-- sola transaccion (si algo falla no se aplica nada):
--   1. PODA la Fase 0: borra todo lo de la Fase 0 (IRREVERSIBLE).
--   2. Aplica las migraciones de la Fase 1, en orden.
--   3. Las registra en supabase_migrations.schema_migrations, para que el
--      \`supabase db push\` del deploy no intente aplicarlas otra vez.
--
-- ANTES: haz un respaldo (Database > Backups o pg_dump).
-- DESPUES: vacia a mano los buckets party-photos y post-images (Storage) y
-- configura Auth. Guia completa: docs/fase-1-mvp-multitenant/puesta-en-marcha.md
-- =============================================================================
begin;
`,
    `-- ===========================================================================
-- 1 / 3  PODA DE LA FASE 0
-- ===========================================================================
${prune}
`,
    `-- ===========================================================================
-- 2 / 3  MIGRACIONES DE LA FASE 1
-- ===========================================================================
`,
    ...migrations.map(
      (f) => `-- ---------------------------------------------------------------------------
-- ${f}
-- ---------------------------------------------------------------------------
${readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8').trim()}
`,
    ),
    `-- ===========================================================================
-- 3 / 3  REGISTRO EN EL HISTORIAL DE MIGRACIONES
-- ===========================================================================
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version)
    values ${versions}
    on conflict (version) do nothing;
  end if;
end
$$;

commit;
`,
  ];

  return parts.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT_FILE, buildSetupSql());
  console.log(`Escrito ${path.relative(root, OUTPUT_FILE)}`);
}
