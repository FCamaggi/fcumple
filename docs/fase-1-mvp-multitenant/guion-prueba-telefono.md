# Guion de prueba de la cámara en teléfono real

**Estado:** preparado el 2026-10-25 para la fiesta del 30-oct 20:30. Nada de la cámara (PR #28 y #30) se ha probado todavía en un teléfono real; solo con Chromium y cámara falsa (`scripts/qa-movil`). Este guion sale de leer el código, no de haber usado la cámara en un teléfono: si algo de aquí no coincide con lo que ves, **gana lo que ves**, y anótalo como hallazgo.

Los textos entre «» son los que el código muestra hoy (`src/components/CameraCapture.tsx`, `CameraSection.tsx`, `camera/StickerTray.tsx`).

## Antes de empezar

- **Cuándo:** a más tardar el 27-oct. El congelamiento de producción empieza la noche del 28-oct; un arreglo necesita su PR y su fusión antes.
- **Dónde:** producción, `https://fcumple-ten.vercel.app/e/<slug>`. Usa un evento de prueba propio, no el de la clienta: las fotos que envíes gastan cupo real y quedan en Storage.
- **Dispositivos:** al menos un Android (Chrome) y un iPhone (Safari). Si hay más, mejor.
- **Cupo:** configura el invitado de prueba con un cupo chico (3 fotos) para llegar al final del rollo rápido. El piloto real es de 10 fotos por invitado.
- **Cuenta:** inscríbete con nombre, apellido y un PIN de prueba. Si la cámara está bloqueada («Cámara // aún bloqueada»), actívala como pida el evento (en la puerta o con el QR de la fiesta).
- **Red:** WiFi o datos normales al empezar. El modo avión se usa solo en la sección D.
- **Permisos:** la primera vez el navegador pide permiso de cámara. Acepta; denegarlo se prueba en el paso 18.

## Cómo anotar un fallo

Un fallo sin dispositivo no sirve: no se puede reproducir ni descartar. Por cada fallo, una fila en una tabla (puede ser una nota del teléfono):

| Campo | Ejemplo |
|---|---|
| Paso | 5 (disparar otra vez sin tocar «Ok») |
| Teléfono (marca y modelo) | Samsung Galaxy A54 |
| Sistema y versión | Android 14 / iOS 17.6 |
| Navegador y versión | Chrome 130 / Safari (su versión es la de iOS) |
| Cómo se abrió | navegador normal / navegador interno de WhatsApp o Instagram / acceso directo en la pantalla de inicio |
| Qué pasó | «El dígito bajó dos veces» |
| Qué debía pasar | «Una vez» |
| Captura de pantalla | sí / no |
| Se repite | siempre / a veces / una vez |

Dónde ver las versiones: Android, Ajustes > Acerca del teléfono; Chrome, menú ⋮ > Configuración > Acerca de Chrome. iPhone, Ajustes > General > Información. Si abriste el enlace desde WhatsApp o Instagram, anótalo: el navegador interno se comporta distinto de Safari o Chrome y a menudo tiene permisos de cámara más limitados.

## Pasos

Lee «Esperado» antes de hacer el paso. Marca ✅ (como se esperaba), ❌ (fallo: llena la tabla) o ➖ (no se pudo probar, y por qué).

### A. Abrir y disparar

1. **Abrir la cámara.** Entra por el enlace del evento, inscríbete o inicia sesión y toca «Abrir cámara».
   - Esperado: el navegador pide permiso (solo la primera vez); tras aceptarlo se ve la cámara a pantalla completa, con el visor en vivo. Arriba, el contador del rollo con un dígito (los disparos que te quedan) y «de N». Abajo, «Marco // <nombre del marco>» y, a su lado, el nombre del evento. En la fila de botones: «Cerrar», flecha izquierda, el obturador, flecha derecha y el botón de cambiar de cámara.
   - Falla si: queda negro, se ve estirado o aplastado, o el obturador no responde.
2. **Disparar.** Toca el obturador una vez.
   - Esperado: se abre la pantalla de revisión con la foto (con el marco encima) y dos botones: «Repetir» y «Enviar // te quedarán N». El dígito del contador **ya bajó** uno (el disparo queda reservado).
   - Falla si: el dígito no baja o baja dos, la foto sale girada, o el marco sale corrido respecto del visor.
3. **«Repetir».** Toca «Repetir».
   - Esperado: vuelve la cámara en vivo, **sin pedir permiso de nuevo**, y el dígito **vuelve** al valor de antes de disparar.
   - Falla si: el dígito se queda abajo, la cámara se congela o pide permiso otra vez.
4. **Enviar.** Dispara de nuevo y toca «Enviar // te quedarán N».
   - Esperado: el botón pasa a «Enviando…» un momento; la revisión se cierra; aparece el sello «Quedó en el rollo» con un botón «Ok». El dígito queda abajo (ya no vuelve). Si el evento modera, debajo dice «Pasa por moderación antes de revelarse.».
   - Verifica aparte: en el panel (`/panel/e/<id>`) la foto está en las fotos del evento, con el estado que corresponde.

### B. Otra foto sin tocar «Ok» (error corregido en el PR #30)

5. Con el sello «Quedó en el rollo» todavía visible, **no toques «Ok»**. Dispara otra foto.
   - Esperado: el sello desaparece al disparar y la revisión se abre normal, con «Enviar // te quedarán N» (no «Enviando…»).
6. Toca «Enviar».
   - Esperado: se envía y vuelve el sello «Quedó en el rollo». Antes del PR #30 este segundo envío se quedaba en «Enviando…» y no se podía enviar.
   - Falla si: el botón dice «Enviando…» sin que se esté enviando nada, o no responde.

### C. Última foto del rollo

7. Repite hasta que quede **1** disparo. Dispara.
   - Esperado en la revisión: «Es tu última foto del rollo» y el botón «Enviar // te quedarán 0». Toca «Enviar».
   - Esperado tras enviar: la pantalla «Rollo terminado», con el contador en 0 (en rojo), el texto «Se acabó tu rollo. Ya diste todos tus disparos para esta noche.» y, arriba, **el sello «Quedó en el rollo»** (no se pierde por haberse agotado el rollo).
   - Verifica: no se puede disparar más. Cierra la cámara y vuelve a abrirla: debe seguir en «Rollo terminado».

> Para seguir con la sección D hace falta cupo: usa otro invitado de prueba o sube el cupo desde el panel.

### D. Fallo de red y «Reintentar»

8. Con la cámara abierta y cupo disponible, **activa el modo avión**. Dispara y toca «Enviar».
   - Esperado: sigues en la revisión. Aparece un aviso en rojo, «No pudimos subir la foto. Intenta de nuevo. Tu foto sigue aquí.», y el botón principal cambia a «Reintentar». La foto no se pierde.
   - Anota el dígito del contador en este momento.
9. Toca «Reintentar» **todavía sin red**.
   - Esperado: vuelve a fallar con el mismo aviso. El dígito **no baja más**.
10. Apaga el modo avión, espera a que vuelva la red y toca «Reintentar».
    - Esperado: se envía, se cierra la revisión y aparece «Quedó en el rollo». El dígito es **el mismo** que antes del primer intento fallido: el reintento no gasta otro disparo.
    - Verifica en el panel que la foto llegó **una sola vez**, sin duplicarse.
11. Repite el paso 8 y esta vez toca «Repetir» en vez de «Reintentar».
    - Esperado: la foto se descarta, el aviso rojo desaparece y el dígito vuelve al de antes de disparar.

### E. Marcos, flash, cámara, stickers y nombre del evento

12. **Cambiar de marco.** Toca las flechas izquierda y derecha (o desliza el visor a los lados, en los marcos clásicos).
    - Esperado: el texto «Marco // …» cambia, el marco cambia en el visor y la foto sale con el marco que se veía. Tras el último marco vuelve al primero.
    - Falla si: el marco del visor no es el que sale en la foto, o sale cortado o estirado.
13. **Flash.** Si ves el botón «Flash apagado» arriba, tócalo.
    - Esperado: cambia a «Flash activado» y se enciende la linterna del teléfono (cámara trasera). El botón solo existe si el dispositivo permite linterna: **Safari en iPhone no suele ofrecerlo**, y que no aparezca allí no es un fallo; anótalo como «sin botón de flash en iOS».
14. **Cambiar de cámara.** Toca el botón de cambiar de cámara.
    - Esperado: alterna entre frontal y trasera. En la frontal el visor se ve como espejo y la foto sale **tal como se veía en el visor** (espejada), con el texto del marco derecho, no espejado.
15. **Stickers.** Si ves el botón «Stickers 0/5» arriba, tócalo y agrega uno con «Agregar sticker …».
    - Esperado: el sticker aparece en el visor, seleccionado. Se arrastra con un dedo; con las acciones del sticker seleccionado se puede agrandar, achicar, girar y quitar. El contador sube («Stickers 1/5») hasta el máximo; al llegar a 5 aparece «Máximo por foto». Dispara: el sticker sale en la foto en el mismo lugar, **debajo del marco** (el marco queda siempre encima). Tras enviar, la foto siguiente parte **sin stickers**.
16. **Nombre del evento en la línea del marco.** Mira la línea de abajo del visor.
    - Esperado: «Marco // <marco>» y, tras una perforación punteada, el nombre del evento. Un nombre largo se corta con puntos suspensivos, sin desbordar la pantalla ni mover los botones.

### F. Casos de borde

17. **Girar el teléfono** a horizontal con la cámara abierta.
    - Esperado: los controles pasan a un costado y siguen alcanzables; el obturador no queda tapado ni cortado.
18. **Permiso denegado.** Con el permiso de cámara del sitio borrado o en una pestaña de incógnito, abre la cámara y **deniega** el permiso.
    - Esperado: «Cámara no disponible» con el texto «No pudimos acceder a la cámara. Revisa los permisos del navegador.». Sin pantalla en blanco y sin obturador activo.
19. **Cerrar con foto en revisión.** Dispara, toca «Repetir», luego «Cerrar», y vuelve a abrir la cámara.
    - Esperado: el contador muestra el cupo real (el disparo descartado no se cobra).
20. **Pantalla bloqueada a mitad.** Dispara, bloquea el teléfono 10 segundos y desbloquéalo.
    - Esperado: sigues en la revisión, con la foto. Si el visor queda congelado al volver, anótalo.

## Resumen para llenar al final

| Teléfono | Navegador | Pasos ✅ | Pasos ❌ (n.º) | Pasos ➖ |
|---|---|---|---|---|
| | | | | |

Criterio para la fiesta: los pasos **1 a 11** deben quedar ✅ en al menos un Android y un iPhone. Un ❌ en los pasos 12 a 20 no bloquea la fiesta por sí solo; decide caso por caso con el hallazgo en mano. Si falla alguno de 1 a 11 y hay un arreglo chico, es un PR aparte que debe estar fusionado **antes de la noche del 28-oct**.

## Plan de contingencia si la cámara falla en la fiesta

La cámara depende del navegador del invitado, de su permiso y de la red del lugar. Lo que conviene tener decidido de antemano:

1. **Navegador de respaldo.** Si a un invitado no le abre la cámara, que abra el enlace en **Chrome (Android) o Safari (iPhone)**. Lo más común es el navegador interno de WhatsApp o Instagram: desde el menú, «Abrir en el navegador».
2. **Permiso denegado por error.** iPhone: Ajustes > Safari > Cámara > Preguntar, y recargar. Android/Chrome: el candado junto a la dirección > Permisos > Cámara > Permitir.
3. **Mala red en la fiesta.** Las fotos no se pierden: queda en la pantalla de revisión con «Reintentar», sin gastar otro disparo. El invitado **no debe cerrar la pantalla ni tocar «Repetir»** hasta que vuelva la red. Avisa de antemano cuál es el WiFi del lugar, si lo hay.
4. **Un invitado sigue sin poder.** Que saque las fotos con la cámara normal de su teléfono y las entregue a quien organiza por un canal definido antes (una carpeta compartida, por ejemplo). Esas fotos **no cuentan** en el rollo de la app; sumarlas al álbum es decisión de la organizadora.
5. **Falla de toda la app** (el enlace no carga o hay errores en todos los teléfonos). Comprueba que `https://fcumple-ten.vercel.app` y el panel abran desde tu teléfono. Si Supabase o Vercel están caídos no hay arreglo esa noche: aplica el punto 4 a todos y avísales por el grupo del evento.
6. **Qué NO hacer desde la noche del 28-oct:** no fusionar ni desplegar cambios, no reiniciar la inscripción de invitados, no cambiar cupos en masa. Un cambio nuevo puede romper lo que ya funcionaba y no hay tiempo de probarlo en teléfonos.
7. **Quién decide.** Antes de la fiesta, acordar quién es la persona de contacto técnico y por qué canal se le avisa.

## Lo que este guion no cubre

- Calidad de la imagen descargada (resolución del visor): queda para después de la fiesta y se mide antes en un teléfono real.
- Moderación y panel del organizador: tienen sus propias revisiones (`informe-revision-movil.md`, `revision-movil-panel.md`).
- Muchos invitados a la vez. Lo más cercano es la capacidad calculada en `notas-temporales-b-c-descarga.md`.
