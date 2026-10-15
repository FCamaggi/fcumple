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

Segunda propuesta: en vez del script, hacer desde el servidor la misma petición que hace el navegador (`POST https://www.nombrerutyfirma.com/rut`, cuerpo `term=<RUT>`), y leer el nombre de la tabla de resultados.

**Misma conclusión: no se integra.** Lo que muestra la petición y la respuesta pegadas:

- La respuesta es una página HTML de consumo (publicidad de Google y analítica incluidas) con una tabla de **nombre, RUT, sexo, dirección y comuna**. Es el mismo conjunto de datos de terceros del raspador; solo cambia el cliente.
- La petición se hizo desde un **navegador** (`credentials: include`, cabeceras de Chrome): el navegador ya había superado el desafío de Cloudflare y lleva su cookie. Un servidor no la tiene: la raíz del sitio sí respondió **403 con `cf-mitigated: challenge`** a una petición simple desde el entorno de desarrollo. Para que una función serverless obtenga la misma respuesta habría que **reproducir o esquivar ese desafío** (navegador automatizado, cookies reutilizadas, rotación de IP), y eso es evadir un control de acceso del sitio: no lo construyo.
- No pude confirmar el comportamiento del `POST` desde un servidor: el entorno bloqueó esa consulta de prueba (es una búsqueda de datos personales de una persona) y no se reintentó ni se rodeó.
- Hacer la petición desde el **navegador del invitado** tampoco sirve: el sitio no tiene CORS para nuestro dominio (no se podría leer la respuesta) y, aunque se pudiera, el cliente podría informar cualquier nombre, así que no demostraría nada.
- Se mantienen los problemas de fondo: sin contrato ni términos de uso accesibles, envío del RUT de cada invitado a un tercero, riesgo legal al cobrar y ninguna garantía de continuidad.

Además, la respuesta pegada contiene datos personales reales (nombre y dirección). **No se guardó en el repositorio** ni se usó como dato de prueba.

D19: no integrar el formulario `POST /rut` de nombrerutyfirma.com. La ruta viable sigue siendo un proveedor con contrato (opción B de la tabla).

