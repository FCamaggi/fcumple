# Prompt para la próxima sesión — repensar arquitectura de información y flujos

Copiá y pegá esto como primer mensaje de la sesión nueva:

---

Trabajemos en fcumple (`/home/fcamaggi/personal/fcumple`). Antes de escribir código, quiero que hagas un pase de arquitectura de información y de flujos — la Etapa 4 de `docs/BACKLOG.md`.

Empezá leyendo, en este orden: `docs/DESEO-DISENO-USUARIO.md` completo (especialmente la sección 10, el addendum más reciente), `docs/BACKLOG.md` completo (sección "Estado real de la app" y "Etapa 4"), `docs/DESIGN.md`, y el código real de `src/App.tsx`, `src/pages/GuestPage.tsx`, `src/pages/AdminPage.tsx` para confirmar que el estado documentado sigue siendo verdad (puede haber cambiado si tocamos algo entre sesiones).

Los cuatro problemas a resolver (detalle completo en `docs/BACKLOG.md` Etapa 4):

1. El admin no tiene un modo mobile real (solo breakpoints sueltos de Tailwind), pese a que se va a operar desde el celular la noche del evento.
2. El invitado que confirma no tiene ninguna pista de que la cámara se desbloquea después, en la puerta — queda sin saber qué esperar.
3. No existe una vista de "hub" compartida entre invitados — avisos, info del evento, y eventualmente el rollo revelado, todo vive embebido en la página personal (`/i/{token}`) de cada uno, sin un punto de encuentro común, a pesar de que la visión original del proyecto habla de un hub.
4. Los toasts (`SignalToast`) no se cierran solos (bug acotado, no de arquitectura — se puede resolver aparte, rápido).

Quiero que primero propongas (sin programar todavía) una arquitectura de información concreta que resuelva 1-3 de forma coherente — no parches sueltos por separado. Pensá en términos de: qué rutas existen, qué ve cada rol (invitado antes de llegar / invitado ya en la fiesta / admin en desktop / admin en el celular en la puerta) en cada momento, y cómo se conectan entre sí. Dame 1-2 propuestas concretas con sus tradeoffs antes de que yo elija una, no asumas una sola solución y la implementes directo.

Una vez que estemos de acuerdo en la arquitectura, quiero que la documentes (actualizando `01-vision-y-requisitos.md`/`02-arquitectura-tecnica.md`/`DESIGN.md` según corresponda, siguiendo la misma disciplina de este proyecto: nunca reescribas `DESEO-DISENO-USUARIO.md`, solo agregale un addendum si hace falta) antes de empezar a construir. Recién ahí seguimos con implementación — con TDD real (test primero, después el código) como se hizo en todo el proyecto hasta ahora, y usando subagentes para las partes que correspondan una vez que el diseño esté claro y no haya ambigüedad que un subagente tenga que inventar por su cuenta.

El punto 4 (toasts sin auto-dismiss) lo podés resolver aparte, es independiente del resto — no hace falta que bloquee el pase de diseño.

---
