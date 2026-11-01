# Ciclo de vida de un tenant: backup, runbook y orden de directorios

Objetivo: dejar un proceso genérico y repetible para cada cliente (tenant), del brief al cierre con backup, probado con [primera clienta].
Rama: `feat/ciclo-de-vida-tenant` (worktree `~/code/fcumple-wt/tenant-ciclo`), desde main `b44462c`. Entrega: `ask-on-risk`. Runner: `npm test` (Vitest) y `npm run test:db` (Postgres real).

## Specs

- **S1 — Backup del tenant.** "hay que hacer una forma de extraer como backup todo lo de [primera clienta], eso deberia ser la forma general de cada migracion de tenant". Un script local `scripts/tenant/export.mjs <slug>` con la clave de servicio: exporta la fila de `events` y todas sus tablas hijas, lista y descarga los archivos de los 3 buckets por el prefijo `{event_id}/` y escribe un manifiesto con conteos y sha256. Nunca exporta `guest_credentials.pin_hash`; redacta `guests.token` y `events.activation_code`. El núcleo usa `pg` con la consulta inyectada y se prueba contra `test:db`.
- **S2 — Orden de directorios.** "quiero ordenar la estructura de directorios tambien". Los datos privados de cada cliente salen del repo público a un repo privado aparte (S4); lo genérico queda en el repo público (`docs/operaciones/`, `scripts/tenant/`, `scripts/marcos/`); los temporales se cierran o archivan.
- **S3 — Runbook del flujo.** "se supone que en los .md debe existir todo el flujo que hicimos con [primera clienta]". Un runbook genérico en `docs/operaciones/` con el flujo completo (brief, evento, marcos, pruebas, día de la fiesta, cierre y backup) y las reglas de privacidad, más una plantilla de carpeta de cliente.
- **S4 — Repo privado de clientes.** "me parece la recomendacion del repo privado". Los datos de clientes viven en un repo git propio, ignorado por fcumple, con un remoto privado. Supuesto: ruta `~/code/fcumple-clientes`; crear el remoto y empujar requiere confirmación del usuario.
- **S5 — Delegación.** "quiero que uses tus capacidades de delegacion para todo cuando sea eficiente y asi no llenamos el contexto".

## Tasks

| ID | Specs | Ruta | Estado | Evidencia |
|---|---|---|---|---|
| T1 | S1 | Delegada: agy (`flash`, run `341f28e3e03c`) en worktree `~/code/fcumple-wt/tenant-export`; razón: unidades en paralelo (S5). Corregida por Claude (resultado `corrected`) | hecha; verificador independiente: PASS sin bloqueantes; A1 y A2 corregidas | `tenant-export.test.ts` 7/7; CLI de punta a punta con `--sin-archivos` y con un Storage simulado |
| T2 | S2 | Delegada: writer nativo (lee datos privados, no va a Google); razón: unidades en paralelo (S5) | hecha | webp idénticos por sha256 con el script original; el SQL solo difiere en comentarios; grep de datos del cliente vacío |
| T3 | S3 | Inline | hecha | `docs/operaciones/ciclo-de-vida-tenant.md`, enlazado desde `docs/README.md` y `CLAUDE.md` |
| T4 | S2, S4 | Inline | local hecho; falta remoto privado y commits (confirmación del usuario) | `~/code/fcumple-clientes`: 97 archivos copiados, original intacto |
| T5 | S1 | Usuario: correr el export de [primera clienta] con la clave de servicio | pendiente | |

## Log

- **L1 (2026-10-31, usuario):** "Ya fue el cumpleaños de [primera clienta], salio todo muy bien, ahora quiero pasar al siguiente tenant, para eso quiero ordenar todo, hay que hacer una forma de extraer como backup todo lo de [primera clienta], eso deberia ser la forma general de cada migracion de tenant, quiero ordenar la estructura de directorios tambien, se supone que en los .md debe existir todo el flujo que hicimos con [primera clienta], ahora quiero saber si existe efectivamente y que son los primeros pasos"
- **L2 (2026-10-31, usuario):** "Ya saqué todas las fotos asi que demosle, backup dejemoslo como confirmado. quiero que uses tus capacidades de delegacion para todo cuando sea eficiente y asi no llenamos el contexto"
- **L3 (2026-10-31, usuario):** "apruebo el plan. me parece la recomendacion del repo privado"
- **L4 (análisis):** no existe runbook del tenant ni nada después de la fiesta; las reglas de privacidad estaban solo en la memoria de Claude. Todas las tablas cuelgan de `events` con `ON DELETE CASCADE`, pero Storage no se borra en cascada. `client_briefs` se une solo por slug. El purge queda fuera hasta probar el export.
- **L5 (revisión de T1):** se corrigieron tres defectos de agy: un nombre de objeto con `..` podía escribir fuera de la carpeta de su bucket; `encodeURI` no codificaba `#` ni `?`; con `--sin-archivos` el manifiesto contaba 0 objetos. Ahora `counts` tiene `storage_objects` (listados) y `files_downloaded`. El test de agy usaba la plantilla `border`, que ya no existe (solo queda `capas`).
- **L6 (entorno):** en WSL no hay Docker; `test:db` corre con un Postgres 16 local desechable (`FCUMPLE_TEST_PG_EXTERNAL=1`). El `node_modules` enlazado desde el checkout viejo no tenía `fflate`; el worktree usa ahora `npm ci`. Checks: typecheck en verde, `vitest` 122 archivos y 1580 tests, `test:db` 15 archivos y 374 tests.
- **L8 (revisión nativa):** los dos rangos quedaron aprobados y con acuse (`review-cc4370c3473d29b2` sobre el export; un segundo linaje sobre marcos y docs). Advertencias: R1-001, este documento nombraba a la clienta en un repo público; se reemplazó por "[primera clienta]" (citas del usuario redactadas solo en ese nombre) y se quitó la fecha de la fiesta del runbook. R1-002, el SQL generado por `preparar-marcos.py` usa dollar-quoting `$json$` y `$$`; una etiqueta o un texto del spec que contenga esas secuencias rompería el SQL. Es heredado del script original y el spec lo escribe el dueño: queda pendiente. Pendiente fuera de alcance: `scripts/qa-movil/mock.js` (ya en `main`) usa el nombre y la fecha reales del evento como fixture.
- **L7 (verificador de T1):** PASS sin bloqueantes. Comprobó que ningún dato de otro evento se cuela (ni con prefijos parecidos), que ninguna salida contiene secretos ni la clave, que hay 13 casos de salida del CLI y que ninguna tabla queda fuera. Se corrigieron A1 (si una descarga aborta, el mensaje avisa que la carpeta quedó incompleta) y A2 (el control de rutas exige la carpeta del evento, no solo la del bucket). Quedan como advertencias A3 (`client_briefs` se une solo por slug, propio del esquema) y A4 (el respaldo de `metadata` se detecta por el texto del error; solo afecta a esquemas de prueba).
