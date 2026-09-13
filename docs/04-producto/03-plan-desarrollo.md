# Invitación de Cumpleaños Web — Plan de Desarrollo

> **Documento fundacional (v1), histórico.** Las Fases 0-6 de abajo ya se completaron íntegramente y quedaron superadas por el trabajo real de las Etapas 1-7 documentado en [`BACKLOG.md`](./BACKLOG.md). Se conserva como referencia del plan original.

## 1. Fases

### Fase 0 — Setup (medio día)
- Crear proyecto en Supabase, definir las tablas `guests` y `event_config`.
- Crear repo, proyecto en Vercel conectado al repo.
- Configurar variables de entorno (URL y anon key de Supabase).

### Fase 1 — Núcleo de datos y admin básico
- CRUD de invitados desde el panel (crear, editar, eliminar).
- Generación automática de token al crear un invitado.
- Botón de copiar link por invitado.
- Listado simple de invitados con su estado.

### Fase 2 — Página pública del invitado
- Ruta `/i/{token}` que resuelve el invitado vía función RPC.
- Página de invitación personalizada con datos del evento.
- Formulario de respuesta (asiste/no asiste, +1, nota).
- Edición de una respuesta ya enviada.

### Fase 3 — Panel de estadísticas
- Totales: confirmados, rechazados, pendientes, headcount real.
- Filtros y buscador en la tabla de invitados.
- Notas privadas del admin visibles solo ahí.
- Exportar a CSV.

### Fase 4 — Diseño y detalles
- Tema visual (con tu identidad de developer si querés, sin que opaque la función).
- Responsive real: invitación y RSVP priorizando mobile (la mayoría de invitados abre el link desde WhatsApp en el celular); panel de admin priorizando desktop (lo usás vos, probablemente desde notebook) — ver `DESIGN.md` sección 2, principio 6.
- Pantallas de carga y de error prolijas (ver `DESIGN.md` sección 8: token inválido, carga, `DoorList` vacío).

### Fase 5 — Prueba con gente real
- Mandar el link a 2 o 3 personas de confianza antes de la tanda completa.
- Verificar que el flujo de editar respuesta funcione bien.
- Revisar que nadie pueda ver los datos de otro (probar con dos tokens distintos).

### Fase 6 — Lanzamiento
- Configurar `event_config` con los datos reales.
- Generar y mandar todos los links.
- (Opcional) activar el cron de keep-alive si venías con más de una semana sin tocar el proyecto.

## 2. Checklist de configuración inicial

- [ ] Proyecto Supabase creado, región elegida.
- [ ] Tablas `guests` y `event_config` creadas.
- [ ] Función RPC de lectura por token, y de actualización por token.
- [ ] Políticas de RLS activas (probadas con dos tokens distintos para confirmar aislamiento).
- [ ] Proyecto Vercel conectado al repo, deploy funcionando.
- [ ] Ruta `/admin` protegida de alguna forma (aunque sea básica).

## 3. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Proyecto Supabase se pausa por inactividad antes del evento | Cron de keep-alive semanal, o simplemente entrar al dashboard una vez antes de mandar los links |
| Un invitado logra ver o editar los datos de otro | Probar explícitamente el aislamiento por RLS antes de lanzar, con al menos dos tokens de prueba |
| Se te ocurre agregar features de último momento que no son del alcance v1 | Revisar la sección "fuera de alcance" del documento de visión antes de aceptar un scope nuevo |
| El día de mandar invitaciones hay un pico de aperturas simultáneas | Ya mitigado por elegir Opción A (sin servidor que duerma), pero probar igual abriendo el link desde varios dispositivos a la vez antes de mandar la tanda real |

## 4. Preguntas abiertas para decidir antes de empezar a codear

- ¿Vas a permitir que el invitado ponga el nombre de sus +1, o solo la cantidad?
- ¿Necesitás un campo de "restricción alimentaria" explícito, o alcanza con la nota libre?
- ¿Preferís Opción A (Supabase, recomendada) u Opción B (backend propio con Express, más trabajo pero más portfolio)? Esto define el resto de las decisiones técnicas.

**Resueltas:**
- ~~¿El panel de admin lo vas a usar solo vos desde tu computador, o también necesitás verlo cómodo desde el celular?~~ → Resuelto: solo vos, principalmente desde desktop. El admin se diseña desktop-first, el celular queda como uso funcional secundario (`DESIGN.md` sección 2, principio 6).
