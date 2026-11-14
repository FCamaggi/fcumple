# Álbum por cara: investigación

Investigación del 2026-11-13 (T8 de `odd/tasks/fotos-originales-pc.md`, spec S6). Pedido original: «explorar el usar un OCR o algo para identificar las caras de las personas, sin nombre asociado, sino que se arme un album por cara para que la gnete pueda buscar sus fotos». **Solo investigación: no se construyó nada.**

## Respuesta corta

| Pregunta | Respuesta |
|---|---|
| ¿Se puede hacer gratis? | Sí. El PC de la casa ya guarda los originales y puede agrupar caras con bibliotecas abiertas, sin servicios pagados. |
| ¿«Sin nombre» lo saca de la ley? | No. Un vector que identifica una cara es un **dato biométrico**, y la Ley 21.719 lo trata como dato sensible aunque no lleve nombre. |
| ¿Qué exige la ley? | Consentimiento expreso de cada persona, informándole el sistema, la finalidad, el plazo y cómo ejercer sus derechos. Tratarlo sin ese consentimiento es infracción grave. |
| ¿El problema de fondo? | Agrupar «todas las caras» procesa también a quienes no aceptaron, que salen igual en las fotos de otros. |
| Recomendación | No llevarlo al cumpleaños del 28-nov. Si se quiere después, la opción con menos riesgo es **«búscame con una selfie»**, solo para quien acepta, con revisión legal antes (ver «Opciones»). |

## Lo que dice la ley

- **Ley 21.719** (publicada el 13-dic-2024). Entra en vigencia el **1-dic-2026**.
  - Hay un proyecto para postergarla al 15-oct-2027 (Boletín 18.623-07). El Senado lo aprobó y la Comisión de Constitución de la Cámara lo aprobó en general el 5-nov-2026.
  - Mientras no se publique, la fecha sigue siendo el 1-dic-2026 ([Cámara](https://www.camara.cl/cms/2026/11/05/proteccion-de-datos-comision-aprobo-postergar-entrada-en-vigencia-de-la-ley/), [Garrigues](https://www.garrigues.com/es_ES/noticia/chile-ejecutivo-presenta-proyecto-postergar-entrada-vigor-nueva-ley-proteccion-datos), [Emol](https://www.emol.com/noticias/Economia/2026/10/28/1215480/ley-datos-personales-senado-postergacion.html)).
- **Los datos biométricos son datos sensibles** (art. 2 letra g). El art. 16 ter permite tratarlos solo con consentimiento expreso. Además hay que informar el sistema biométrico, la finalidad específica, el período de uso y la forma de ejercer los derechos. Sin consentimiento, solo caben las excepciones del art. 16 bis. Tratarlos sin base legal es infracción grave (art. 34 ter) ([Diario Constitucional](https://www.diarioconstitucional.cl/articulos/desafios-practicos-del-registro-de-asistencia-biometrico-en-el-sector-publico-bajo-la-ley-n-21-719-y-el-oficio-123145-2025-de-la-contraloria-general-de-la-republica/), [Ecija](https://www.ecija.com/actualidad-insights/el-uso-de-biometria-y-la-proteccion-de-datos-lecciones-de-la-aepd-que-hacen-eco-en-chile/)). Las sanciones llegan a 20.000 UTM o el 4 % de los ingresos anuales ([Usercentrics](https://usercentrics.com/es/knowledge-hub/ley-proteccion-datos-chile/)).
- **Pendiente de verificar:** la redacción exacta de los arts. 2 g, 16 bis y 16 ter en el texto oficial ([BCN, Ley 21.719](https://www.bcn.cl/leychile/navegar?idLey=21719)). Lo de arriba sale de análisis de terceros.
- El 28-nov todavía rige la Ley 19.628, pero el producto sigue después del 1-dic. Conviene diseñarlo desde ya para la ley nueva.

## Opciones

| Opción | Cómo funciona | Biometría de quién | Riesgo | Esfuerzo |
|---|---|---|---|---|
| A. Álbum por cara para todos | El PC detecta todas las caras, las agrupa y muestra un álbum por grupo. | **De todos**, incluso de quien no aceptó. | Alto: no hay consentimiento posible de todos los que aparecen, y cualquiera ve los álbumes de los demás. | Medio |
| B. «Búscame con una selfie» | Quien acepta se saca una selfie. El PC compara solo esa cara con las fotos publicadas y le arma su álbum privado. | Del que acepta. Para comparar, igual se calcula al vuelo el vector de cada cara de las fotos, y se descarta. | Medio: queda la pregunta legal de si calcular y descartar al vuelo es «tratar» los datos de terceros. Requiere revisión legal. | Medio |
| C. «Aparezco en esta foto» | El invitado marca a mano las fotos donde sale; su álbum son esas fotos. | De nadie. | Bajo: no hay biometría. | Bajo |
| D. Lo que ya existe | Cada invitado ve sus propias fotos y el rollo por horas. | De nadie. | Ninguno. | — |

**Recomendación:** C si se quiere algo ya, porque es barato y no tiene riesgo legal. B como versión «mágica» más adelante, con consentimiento y revisión legal. A, no.

## Técnica, si se hace B

| Pieza | Opción | Licencia y notas |
|---|---|---|
| Detección y vector de la cara, en el PC | InsightFace (ArcFace) en Python | El código es MIT, pero los modelos preentrenados son **solo para investigación no comercial**, y el paquete `buffalo_l` pide licenciarlo aparte ([InsightFace](https://github.com/xialuxi/insightface), espejo; confirmar en el repositorio oficial). No sirve si fcumple cobra. |
| Detección y vector de la cara, en el navegador o en Node | `@vladmandic/human` | MIT según los listados ([ecosyste.ms](https://awesome.ecosyste.ms/projects/3411565), [README](https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/README.md)). Trae una demo de «face match». Su último push es de abril de 2024: hay que revisar el mantenimiento y la licencia de cada modelo. |
| Comparación | Distancia coseno entre vectores, con un umbral calibrado en fotos reales | Sin dependencias. |
| Agrupar (solo para A) | DBSCAN de scikit-learn | BSD. |

Cómo encajaría con lo construido: el worker del PC (T3) ya recibe cada original. Un proceso aparte calcularía los vectores solo cuando un invitado con consentimiento pide su álbum, y la respuesta sería la lista de rutas de sus fotos, firmadas como en T2. Los vectores vivirían solo en el PC, nunca en Supabase, y se borrarían al cerrar el evento o cuando el invitado retire el consentimiento.

## Requisitos mínimos para B

- Una casilla separada y opcional, nunca premarcada, que informe el sistema, la finalidad (encontrar tus fotos de este evento), el plazo (por ejemplo, 30 días después del evento) y cómo retirar el consentimiento.
- La selfie y su vector se borran al retirar el consentimiento o al vencer el plazo, con un test que lo verifique, igual que el de los datos en claro.
- Ningún álbum ajeno es visible: cada uno ve solo el suyo.
- Ninguna columna de Supabase guarda vectores ni selfies.
- Revisión de un abogado antes de activarlo con invitados reales.

## Decisión pendiente

¿Seguimos con C («aparezco en esta foto», sin biometría), dejamos B para después de una revisión legal, o lo descartamos? Hasta que lo decidas no se construye nada.
