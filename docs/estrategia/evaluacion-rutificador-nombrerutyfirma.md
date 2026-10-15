# Evaluación: `rutificador_nombrerutfirma` como servicio de identificación

Fecha: 2026-10-15. Pedido: evaluar el uso de <https://github.com/deividxyz/rutificador_nombrerutfirma> para resolver RUT → nombre al identificar invitados, considerando que la plataforma va a cobrar y que el RUT no se guardaría ("es solo una request").

**Veredicto: no se recomienda y no se integra.** No es un servicio sino un raspador de un sitio de terceros; hoy ni siquiera funciona desde un servidor, y para un producto de pago agrega riesgo legal y de continuidad sin aportar seguridad. El modo por nombre y apellido cubre la necesidad sin esos riesgos.

## Qué es realmente (leído del código; no se ejecutó)

- Un script de Python (2 archivos, último commit **2021-05-14**, 29 commits, 20 estrellas) que hace `GET https://nombrerutyfirma.com/rut?term={rut}` y extrae la **primera fila de una tabla HTML con un XPath fijo** (`/html/body/div[2]/div/table/tbody/tr[1]/td`).
- Devuelve **nombre, RUT, sexo, dirección y comuna** de la persona consultada. Para identificar a un invitado solo hace falta el nombre: el resto es información personal de terceros que no necesitamos.
- **Sin licencia** en el repositorio (por defecto, todos los derechos reservados). El README dice que no tiene relación con el sitio ni con sus datos y que el autor "se desliga de cualquier responsabilidad".
- Incluye integración con **Tor** (`--habilitar-tor`) y renovación de identidad para **eludir los bloqueos de IP** del sitio. El propio código imprime "Baneado" al detectar el bloqueo. Además, la detección tiene un error (`if 'Access denied' in titulo or 'Attention Required!':` es siempre verdadera, porque el segundo operando es un texto no vacío), así que daría por baneada cualquier respuesta.
- Está pensado para volcar consultas masivas a una base SQLite local, el uso opuesto al de una consulta puntual y sin persistencia.

## Qué pasa hoy con el sitio

Consultado desde este entorno el 2026-10-15: `https://nombrerutyfirma.com/` responde **HTTP 403** con `cf-mitigated: challenge` y una página "Chequeo de Integridad" (desafío administrado de Cloudflare que exige ejecutar JavaScript). Un cliente HTTP simple, como el de este script y como lo sería una función serverless, **no pasa**. Funcionar exigiría navegadores automatizados o rotación de IP/Tor, es decir, evadir una medida de protección que el sitio puso a propósito. No consulté ningún RUT real.

## Por qué "es solo una request" no alcanza

No guardar el dato resuelve **una** parte (la nuestra), pero los problemas están en otro lado:

1. **Se envía el RUT de cada invitado a un sitio ajeno, anónimo, sin contrato.** Cada consulta le dice a su operador quién va a qué evento y desde qué servidor. Es una comunicación de datos personales a un tercero que no controlamos ni podemos auditar, justo lo que la política de "no guardar nada" quería evitar.
2. **Procedencia desconocida de los datos.** No pude encontrar términos de uso ni origen de la base (el sitio está tras el desafío y las búsquedas no devolvieron nada). Obtener y usar datos personales (incluida la dirección) de personas que nunca nos los dieron, desde una fuente sin autorización clara, es el escenario de mayor riesgo bajo la Ley 19.628 y, cuando entre en vigencia, la Ley 21.719. **No soy abogado**: antes de cobrar conviene consultarlo, pero este riesgo no aparece con un proveedor contratado.
3. **Cobrar agranda la exposición.** Un producto de pago que depende de un raspador no autorizado queda a un reclamo, a un bloqueo o a un cambio de HTML de dejar a todos los invitados fuera, en plena fiesta.
4. **Continuidad.** Sin SLA, sin soporte, con un XPath fijo y un desafío anti-bots activo, la probabilidad de que falle el día del evento es alta.
5. **No mejora la seguridad.** El RUT es semipúblico: quien lo conoce puede hacerse pasar por otro con o sin esta herramienta. El nombre y apellido ofrecen el mismo nivel de identificación.
6. **Minimización de datos.** Se descargan sexo y dirección para usar una sola palabra: el nombre.

## Alternativas, de mejor a peor ajuste

| Opción | Costo | Estado |
|---|---|---|
| **A. Nombre y apellido** (`identifier = 'name'`) | US$0 | **Implementada** y probada (Etapa 1). Recomendada para el MVP. |
| **B. Proveedor de verificación con contrato** (p. ej. Verifik, Didit) | Aprox. US$0,20 por consulta en el caso de Didit (~US$16 por evento de 80 personas); por confirmar si resuelven nombre solo con el RUT | Se activaría con `identifier = 'rut_lookup'`. La función `/api/identify` ya está lista para recibir un proveedor, **sin ninguno configurado**. Requiere contrato de encargado de tratamiento. |
| C. ClaveÚnica | Gratis, con trámite | Pensada para trámites del Estado; no está claro que un privado pueda integrarla. Por investigar. |
| D. Raspador `rutificador_nombrerutfirma` | Gratis, pero con costo legal y operativo | **Descartada.** |

## Decisión

D18: no integrar el raspador. Mantener la identificación por nombre y apellido como camino por defecto; dejar el contrato `rut_lookup` listo para enchufar un proveedor con contrato cuando haya ingresos que lo justifiquen.

## Adenda (2026-10-15): usar directamente el formulario web (`POST /rut`)

Segunda propuesta: en vez del script, hacer desde el servidor la misma petición que hace el navegador (`POST https://www.nombrerutyfirma.com/rut`, cuerpo `term=<RUT>`) y leer el nombre de la tabla de resultados. La respuesta tiene el mismo conjunto de datos de terceros (nombre, RUT, sexo, dirección, comuna) dentro de una página con publicidad y analítica.

### Corrección sobre la parte técnica

En un primer análisis afirmé que la petición solo funcionaba porque el navegador ya había superado el desafío de Cloudflare y llevaba su cookie. **Eso era una inferencia mía (por `credentials: "include"`) y la prueba del usuario la desmiente**: la misma petición hecha desde Postman, sin cookies, funcionó.

Lo que sí se observó: la raíz del sitio respondió **403 con `cf-mitigated: challenge`** a una petición simple desde el entorno de desarrollo (una IP de centro de datos). La conclusión correcta es más matizada:

- Cloudflare decide por la **reputación de la IP, el origen de red y la huella de la petición**, no solo por cookies. Que funcione desde una IP residencial con Postman **no demuestra** que funcione desde las IPs de Vercel/AWS, y el sitio puede cambiar sus reglas cuando quiera.
- Una petición simple y honesta (sin cookies, sin Tor, sin rotar IP ni User-Agent) **no es evasión**. Si el sitio la acepta, no hay nada que esquivar; si la bloquea, hay que fallar cerrado y no insistir.
- La única forma de saber si sirve en producción es probarla desde el despliegue real.

### Lo que sigue en pie (no depende de la parte técnica)

- Sin contrato ni términos de uso accesibles; datos de procedencia desconocida (incluye dirección y sexo, que no necesitamos).
- El RUT de cada invitado se envía a un tercero que no controlamos.
- Cobrar agranda la exposición legal (consultar a un abogado antes de cobrar).
- Sin garantías de continuidad: si el sitio cambia el HTML, agrega un desafío o bloquea, la verificación por RUT cae el día del evento.

### Estado

No se construyó el adaptador en esta sesión: el entorno de ejecución bloqueó escribirlo (es un cliente de búsqueda de datos personales) y no se rodeó ese bloqueo. La interfaz `IdentityProvider`, el registro `PROVIDERS` (`src/server/providers.ts`, vacío), `/api/identify`, el presupuesto de consultas y la base de datos ya están listos para recibirlo.

**Requisitos para cualquier adaptador de este sitio**, si el usuario decide escribirlo y asumir el riesgo:

1. Una sola petición `POST` simple, con tiempo límite; sin cookies, sin Tor, sin rotación de IP o User-Agent, sin reintentos agresivos.
2. **Falla cerrada**: ante un 403, un desafío (`cf-mitigated`, "Chequeo de Integridad") o una página sin la forma esperada, lanzar un error genérico (`provider_error`, 502) y no insistir.
3. Leer **solo el nombre**, de la fila cuyo RUT coincide con el consultado; descartar sexo y dirección en el acto.
4. El RUT no se registra (ni en logs ni en mensajes de error), y la respuesta HTML no se guarda.
5. Activarse solo con `IDENTITY_PROVIDER=nombrerutyfirma` y estar apagado por defecto.
6. Probar con HTML sintético (nombres y RUT inventados); nunca con datos reales de personas.
7. Verificarlo primero desde un despliegue de prueba en Vercel antes de depender de él.

D19: no se integra el formulario en esta etapa. Queda como opción a cargo del usuario, con los requisitos de arriba, y sin recomendación para un producto de pago.

## Adenda 2 (2026-10-15): "¿y si es solo una búsqueda, o un iframe, y no guardamos nada?"

Pregunta del usuario: si la consulta es como buscar en Google (o un iframe), solo para cruzar RUT → nombre contra el nombre de la lista, sin guardar nada y solo la primera vez, ¿cuál es el problema?

**1. Un iframe no puede hacer el cruce.** Un iframe de otro dominio se puede mostrar, pero la página que lo contiene **no puede leer su contenido** (política de mismo origen): no hay forma de que nuestra app obtenga el nombre para compararlo. El invitado solo vería el resultado y tendría que escribirlo a mano, es decir, volveríamos a pedirle el nombre. Además, la respuesta de ese sitio que se observó incluía `X-Frame-Options: SAMEORIGIN`, que impide incrustarlo desde otro dominio (visto en la página de desafío; no verificado en la de resultados).

**2. El iframe trae publicidad y analítica de terceros a nuestros invitados.** La página de resultados incluye `adsbygoogle` y `gtag` (se ve en la respuesta pegada). Incrustada, cargaría esos rastreadores en el navegador del invitado, dentro de nuestra app.

**3. Mostraría dirección y sexo de quien se consulte.** Cualquiera puede escribir el RUT de otra persona; el resultado que ve incluye su dirección. Es incorporar un buscador de personas a nuestro producto.

**4. "No guardar" no es la única obligación.** Las leyes de datos personales (Ley 19.628 hoy; Ley 21.719 cuando entre en vigencia) regulan el *tratamiento*, que incluye recolectar, consultar y **comunicar** datos, no solo almacenarlos. Enviar el RUT de cada invitado a un tercero es una comunicación aunque no la guardemos. Una búsqueda hecha por el propio invitado en su navegador es otra cosa (sería como Google), pero entonces nosotros no recibimos el resultado y no sirve para cruzar nada. No soy abogado: conviene consultarlo antes de cobrar.

**5. El cruce RUT → nombre no aporta seguridad y empeora la coincidencia.**
- El RUT es público, así que quien lo conozca se identifica igual que con el nombre (lo dijo el propio usuario).
- El sitio devuelve el **nombre legal completo** ("Soto Rojas Ana María"), pero el organizador suele anotar apodos o nombres cortos ("Anita Soto", "Fabri Camaggi"). Con el nombre legal, "Fabri" no coincide con "Fabrizio" y el invitado queda fuera aunque esté en la lista. Con el nombre que escribe el propio invitado, la coincidencia es más tolerante.
- Lo único que el RUT aportaría es distinguir homónimos; eso se resuelve más barato pidiendo el segundo apellido (ya implementado: `ambiguous`).

**6. "Solo la primera vez"** ya es así en el diseño actual (el token queda guardado en el dispositivo), pero esa primera vez ocurre una vez por invitado por evento (unas 80 consultas a un tercero por evento) y se repite cada vez que el navegador pierde su almacenamiento o el invitado cambia de teléfono.

**Qué problema real sí vale la pena resolver:** que alguien se haga pasar por otro invitado. La solución con el mejor costo-beneficio no es el RUT sino una **clave personal** que el invitado elige la primera vez que entra (propuesta, por confirmar con el usuario): después, el nombre solo no basta y nadie más puede reclamar esa identidad.

