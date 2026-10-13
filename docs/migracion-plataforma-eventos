# **Informe Técnico, Financiero y de Arquitectura de Software: Plataforma Híbrida Multi-tenant de Fotografía para Eventos ("Burn Camera")**

## **Arquitectura Multi-Tenant y Estrategia Free Tier (MVP Costo \$0)**

El prototipo original fcumple fue concebido como un sistema monolítico para un evento único, con variables de entorno estáticas y acoplamiento directo entre la interfaz de usuario y la base de datos. La evolución hacia una plataforma SaaS (*Software as a Service*) multi-tenant exige una reestructuración completa de la capa de datos y de la lógica de negocio para permitir instanciar eventos dinámicos aislados bajo un único despliegue de infraestructura, garantizando la confidencialidad de la información y la escalabilidad operativa.

### **Reestructuración del Código Base de fcumple a Multi-Tenant**

Para transformar el repositorio monolítico en un sistema multitenant dinámico, la estrategia de base de datos implementa *Row Level Security* (RLS) en PostgreSQL mediante Supabase1. Toda tabla de la base de datos (events, photos, guests, frames, moderation\_queue) incorpora las columnas tenant\_id y event\_id. La jerarquía organizacional sitúa al *Tenant* (u Organización) en la cúspide, administrando múltiples *Eventos*. Cada evento engloba a sus respectivos *Invitados* (con roles asignados), *Fotografías* (con estados de revelado) y la configuración de *Marcos y Stickers*.  
El aislamiento se ejecuta en el motor de la base de datos definiendo políticas RLS automáticas. Cada petición HTTP o conexión WebSocket incluye un token JWT (*JSON Web Token*) que transporta las afirmaciones (*claims*) del usuario, especificando su rol (host, moderator, guest, vip) y el identificador del evento activo.  
La lógica de acceso dinámico se resuelve mediante códigos alfanuméricos de evento o enlaces firmados con identificadores únicos (UUIDv4). Cuando un invitado escanea el código QR del evento, el cliente ligero consume una función de borde (*Edge Function*) que valida la vigencia del evento, el estado de la suscripción del anfitrión y genera una sesión anónima autenticada con permisos restringidos exclusivamente a la lectura de plantillas y la escritura en la cola de subida del evento correspondiente.

### **Mapeo de Arquitectura sobre Planes Gratuitos (Free Tiers)**

Durante la fase de desarrollo, pruebas alfa y primeros eventos piloto, la infraestructura puede operar al 100% bajo niveles gratuitos (*Free Tiers*) combinando proveedores especializados en componentes específicos de la pila tecnológica1.

| Proveedor | Servicio / Componente | Límite del Plan Gratuito (Free Tier) | Comportamiento al Exceder o Inactividad |
| :---- | :---- | :---- | :---- |
| **Supabase** | Base de Datos PostgreSQL, Auth, Realtime, Edge Functions | 500 MB de base de datos, 1 GB de almacenamiento, 5 GB de transferencia de salida (*egress*), 50,000 MAUs1. | **Pausa automática tras 7 días de inactividad**1. Requiere reactivación manual desde el panel de control. |
| **Cloudflare R2** | Almacenamiento de Objetos de Imágenes | 10 GB de almacenamiento, 1,000,000 operaciones Clase A (escritura), 10,000,000 Clase B (lectura), **0 USD por transferencia de salida (*zero egress*)**3. | Se deniegan nuevas escrituras o se factura el exceso a tarifa por uso (\$0.015/GB) sin pausar el servicio9. |
| **Vercel** | Hosting Web Frontend y API Serverless (Next.js/React) | 100 GB de transferencia de datos, 1,000,000 ejecuciones de Edge Functions, 100 GB-horas de cómputo4. | Pausa del despliegue hasta el siguiente ciclo de facturación10. **Restringido a uso personal no comercial**10. |
| **Expo (EAS)** | Compilación y Notificaciones Push Mobile | 30 compilaciones automáticas mensuales (*EAS Build*) en la nube para iOS/Android. | Cola de compilación con prioridad reducida o requerimiento de compilación local en máquina propia. |

### **Riesgos Operativos del Free Tier y Ruta de Migración a Planes Pro**

El mayor riesgo operativo en la fase inicial radica en la pausa automática por inactividad de Supabase (7 días sin peticiones a la API)1. Si un evento de prueba ocurre tras una semana de inactividad en desarrollo, los invitados experimentarán un fallo total de conexión. Para mitigar esto en el MVP \$0, se programa un *cron job* externo (por ejemplo, mediante GitHub Actions o Cloudflare Workers Cron Triggers) que ejecuta un ping de lectura a la base de datos cada 72 horas.  
La ruta de migración a planes pagados se activa automáticamente cuando se cumplen las siguientes métricas de negocio o técnicas:

> 1. **Entrada del Primer Evento Monetizado**: Se actualiza Supabase al plan Pro (\$25 USD/mes)1. Esto elimina la pausa por inactividad, habilita copias de seguridad diarias automáticas, amplía la base de datos a 8 GB y añade 100 GB de almacenamiento con 250 GB de transferencia de salida1.  
> 2. **Lanzamiento Comercial en Web**: Vercel exige el plan Pro (\$20 USD/usuario/mes) para cualquier aplicación que genere ingresos directos o indirectos10. Esto incrementa la transferencia a 1 TB y desbloquea la prevención de inicios en frío (*cold start prevention*)13.  
> 3. **Escalamiento de Almacenamiento**: Cloudflare R2 no requiere migrar de plan; automáticamente pasa al modelo *Pay-As-You-Go* cobrando únicamente \$0.015 USD por GB adicional tras superar los 10 GB9, manteniendo el costo de transferencia de salida en \$0 USD de forma permanente3.

## **Arquitectura Híbrida y Experiencia de Usuario (Móvil \+ Web)**

El éxito operacional de una plataforma de fotografía en eventos masivos depende críticamente de eliminar la fricción de entrada para los invitados, garantizando al mismo tiempo un panel de control robusto e intuitivo para el anfitrión.  
El flujo de usuario divide la interacción según el rol del participante. El invitado escanea un código QR en el evento y es dirigido automáticamente según su sistema operativo a un iOS App Clip o a una Android Instant App / PWA PWA sin necesidad de descargar aplicaciones completas. Por otro lado, el anfitrión opera la aplicación nativa completa instalada en iOS o Android para administrar el evento, moderar fotografías y procesar pagos. Ambos flujos convergen en un código base unificado en React Native y Expo.

### **Estrategia "Descarga Cero" para Invitados**

Obligar a un invitado a buscar, descargar e instalar una aplicación de 100 MB desde la App Store o Google Play Store para tomar fotos durante una fiesta reduce la tasa de participación hasta en un 70%. La plataforma implementa una estrategia de "Descarga Cero" diferenciada por sistema operativo:

* **iOS (App Clips)**: Implementación de una mini-aplicación nativa de iOS cuyo paquete binario no supera los 15 MB. Al escanear el código QR que contiene una URL con *App Clip Code Header*, iOS despliega una tarjeta nativa en la parte inferior de la pantalla. En menos de 2 segundos, el usuario accede a una experiencia nativa fluida con acceso directo al hardware de la cámara, GPU acelerada para renderizado de marcos y almacenamiento en caché nativo. Se debe cumplir estrictamente la regla de alineación de memoria de páginas de 16 KB introducida en las versiones recientes de iOS/Android para compilaciones nativas15.  
* **Android (Google Play Instant / Web PWA Avanzada)**: En Android, se despliega Google Play Instant para ejecutar un módulo nativo sin instalación previa o, de forma complementaria, una *Progressive Web App* (PWA) optimizada con acceso a navigator.mediaDevices.getUserMedia. La PWA utiliza *Service Workers* para almacenar en caché las plantillas vectoriales y permitir la captura offline en lugares con baja cobertura celular.

### **App Mobile Completa para el Anfitrión / Organizador**

El anfitrión requiere capacidades avanzadas de gestión que justifican la instalación de la App Mobile Completa (iOS/Android):

* **Creación y Configuración del Evento**: Definición de horarios de inicio/cierre, reglas de revelado, asignación de código de acceso y personalización de la experiencia.  
* **Consola de Moderación en Tiempo Real**: Vista previa tipo deslizamiento continuo o rejilla de rápida aprobación/rechazo de fotos subidas por los invitados.  
* **Editor y Tienda de Marcos/Stickers**: Compras dentro de la aplicación (*In-App Purchases*) de paquetes gráficos exclusivos y herramientas para posicionar elementos dinámicos.  
* **Procesamiento de Pagos e Inicios de Revelado**: Interfaz para seleccionar el paquete de fotos deseado y procesar la compra.

### **Evaluación de React Native \+ Expo como Código Base Unificado**

La selección de **React Native con Expo** como marco de desarrollo unificado permite maximizar la reutilización de código entre la App nativa completa, los App Clips de iOS, las Instant Apps de Android y la versión Web.

| Criterio de Evaluación | App Nativa (Anfitrión) | App Clip / Instant App (Invitado) | Versión Web PWA (Invitado/Wall) |
| :---- | :---- | :---- | :---- |
| **Porcentaje de Código Compartido** | 100% (Código Base React Native) | \~85% (Excluye librerías pesadas de pagos) | \~80% (Adaptación de APIs de cámara Web) |
| **Límite de Tamaño de Binario** | Sin límite estricto (\~30-50 MB) | **Límite crítico de 15 MB** | N/A (Carga diferida de paquetes JS) |
| **Acceso a Hardware de Cámara** | Directo (expo-camera / Native) | Directo (expo-camera optimizado) | Vía API WebRTC / getUserMedia |
| **Captura Offline** | Soporte total con SQLite/AsyncStorage | Almacenamiento temporal en memoria | Soporte vía *IndexedDB* y *Service Workers* |
| **Método de Distribución** | App Store / Google Play Store | Activación por QR / NFC URL | Acceso directo por navegador Web |

## **Motor de Cámara, Gráficos y Sistema de Revelado "Burn" con Moderación**

La captura fotográfica dentro de la plataforma trasciende la simple toma de imágenes digitales al simular la experiencia analógica de una cámara desechable ("Burn Camera"), combinada con superposiciones de diseño en tiempo real y moderación contextual.  
La canalización (*pipeline*) de una fotografía inicia con la captura a través de un motor gráfico optimizado en Canvas 2D/WebGL con superposiciones vectoriales o PNG. La foto bruta se envía de inmediato a Cloudflare R2 en estado de revelado (*Developing*). Posteriormente, el sistema clasifica automáticamente las fotos por bloques de tiempo (*time-slots*) y evalúa el rol del usuario: las capturas del anfitrión o VIPs son auto-aprobadas, mientras que las de los invitados quedan en cola de moderación. Finalmente, el anfitrión realiza una liberación masiva (*Burn Release*) que distribuye simultáneamente las imágenes a la galería y al muro de proyección en vivo.

### **Motor de Cámara y Gráficos (Marcos Vectoriales y Stickers)**

En lugar de aplicar filtros de color pesados mediante *shaders* complejos que sobrecalientan los dispositivos móviles y consumen batería rápidamente, el motor gráfico prioriza una canalización de superposición basada en HTML5 Canvas 2D / WebGL en la Web y react-native-skia en la App Nativa / App Clip.

* **Superposición de Marcos Vectoriales/PNG**: El marco gráfico se renderiza como una capa transparente sobre el visor de la cámara. La imagen capturada mantiene la resolución nativa del sensor, mientras que el marco (en formato SVG vectorial o PNG de alta densidad a 300 DPI) se escala e integra matricialmente sobre la fotografía antes de la compresión JPEG/WebP.  
* **Motor de Stickers Interactivos**: Los usuarios pueden arrastrar, escalar y rotar *stickers* vectoriales sobre la pantalla antes de fijar la captura. La posición final de cada *sticker* se calcula en coordenadas normalizadas (0.0 a 1.0) respecto al ancho y alto de la imagen, permitiendo renderizar la versión final en el servidor o en el cliente a cualquier resolución sin pérdida de calidad.

### **Editor de Marcos: Plantillas Gratuitas vs. Sistema Premium**

El editor de marcos se concibe como un diferenciador clave de monetización dentro de la plataforma:

* **Nivel Gratuito (Basic Templates)**: Acceso a plantillas estáticas prediseñadas por categoría (Bodas, Cumpleaños, Fiestas Corporativas), posicionamiento de texto básico estático no modificable y marcos estáticos PNG de resolución estándar.  
* **Nivel Premium (Custom Dynamic Templates)**: Permite la inyección de campos dinámicos vinculados a la base de datos del evento (por ejemplo: {{event\_title}}, {{event\_date}}, {{host\_names}}, {{guest\_name}}). El motor compila automáticamente estas variables dentro de la tipografía seleccionada al momento de la captura. Incluye además librerías temáticas de stickers vectoriales ilustrados y la posibilidad de subir logotipos de patrocinadores, códigos QR secundarios e ilustraciones SVG personalizadas.

### **Sistema de Revelado "Burn" con Moderación Jerárquica**

El concepto "Burn" simula el rollo de una cámara analógica: las fotos tomadas por los invitados no se publican inmediatamente en la galería pública, sino que entran en un estado de "revelado" (*Developing*).

* **Agrupación Automática por Rangos Horarios**: El sistema agrupa automáticamente las capturas en lotes de tiempo (por ejemplo, bloque de 21:00 a 22:00 hrs). Esto facilita al moderador la revisión secuencial de los hitos clave del evento.  
* **Aprobación Automática según Roles y Permisos**: Las fotos capturadas por el anfitrión o los moderadores designados saltan la cola de moderación y se aprueban automáticamente (APPROVED). Los invitados etiquetados como VIP por el anfitrión obtienen aprobación directa, mientras que todas las capturas de invitados estándares se clasifican como pendientes (PENDING\_MODERATION).  
* **Panel de Moderación y Liberación Masiva ("The Burn Release")**: El anfitrión dispone de un panel con gestos rápidos (deslizamiento a la derecha para aprobar, a la izquierda para descartar). Al llegar a una hora clave del evento (o al final del mismo), el anfitrión pulsa el botón "Liberar Revelado". Esto desencadena un evento WebSocket global que "revela" simultáneamente las fotos aprobadas en las pantallas de todos los invitados y en la proyección en vivo, generando un momento de sorpresa colectiva.

## **Módulos Complementarios y Estrategia de Diferenciación**

Para maximizar el valor percibido por los anfitriones y diferenciarse de soluciones que solo ofrecen galerías compartidas, la plataforma integra cuatro módulos de extensión de alto margen.

### **Proyección en Vivo (Live Slideshow / Muro de Fotos)**

Consiste en una aplicación web independiente optimizada para ejecutarse en monitores, Smart TVs o proyectores de eventos a través de una URL dedicada (burncamera.com/e/{event\_slug}/live).  
Desarrollada sobre Supabase Realtime o WebSockets nativos de Cloudflare Workers, cada vez que una foto es aprobada por el moderador o se ejecuta el "revelado", la pantalla recibe la carga útil (*payload*) y ejecuta una transición animada en GPU (utilizando Three.js o Framer Motion). Incluye modos de visualización dinámicos (cuadrícula estilo Masonry, foto individual destacada con marco dinámico, o efecto mosaico) y la superposición automática de un código QR flotante en la esquina inferior para incentivar a nuevos invitados a escanear y participar.

### **Libro de Visitas Digital (Digital Guestbook)**

Cada fotografía capturada permite adjuntar una nota de voz corta (hasta 15 segundos) o un mensaje de texto dedicado. El sistema consolida estas entradas en una línea de tiempo interactiva donde el anfitrión puede escuchar los audios de sus invitados asociados a la imagen exacta en la que fueron capturados.

### **Venta e Impresión de Libros de Fotos (Photobooks) bajo Demanda**

Una vez finalizado el evento, la plataforma ofrece la transformación de la galería digital en un Photobook físico mediante APIs globales de *Print-on-Demand* (POD). Se han evaluado los dos proveedores más avanzados del mercado: **Gelato API** y **Prodigi API v4**.

| Característica / Métrica | Gelato API | Prodigi API v4 |
| :---- | :---- | :---- |
| **Red de Producción Global** | Más de 140 centros de producción en 32 países16. | Red extensa centrada en EE.UU., Reino Unido y Europa17. |
| **Documentación y Flujo API** | Endpoints para plantillas (Get Template, Create Product) y pedidos automatizados18. | API v4 RESTful, soporte de Sandbox dedicado (api.sandbox.prodigi.com)17. |
| **Especificaciones Técnicas** | Estándar PDF/X, soporte multi-página dinámico21. | Formatos JPG, PNG, PDF. Cálculo automático de lomo y sangría17. |
| **Estructura de Costos Photobook** | Precio base por producto según país \+ costo por página adicional. Descuentos en envíos con Gelato+ (\$24/mes)22. | **Precio base incluye las primeras 24 páginas**17. Páginas adicionales facturadas por unidad17. |
| **Endpoint de Cotización** | Módulo de cálculo en panel y llamadas API de cotización pre-pedido. | Endpoint /Quotes nativo que devuelve desglose exacto de costo e impuestos pre-envío17. |

Prodigi resulta óptimo por su estructura clara de precios que incluye 24 páginas en la tarifa base y su endpoint de cotización pre-orden (/Quotes)17. No obstante, Gelato representa la opción superior para eventos en Latinoamérica y regiones diversas debido a su red de más de 140 imprentas locales que reducen drásticamente los costos de envío internacional y tiempos de entrega16.

### **Generación y Venta de Kits de Señalética QR**

El sistema integra un generador automático de PDFs vectoriales a alta resolución (300 DPI). Al crear el evento, el anfitrión puede descargar gratis las plantillas en PDF para imprimir en casa, o encargar el "Kit Físico de Señalética" (que incluye tótems de mesa acrílicos, tarjetas QR impresas en papel couche de 300g y adhesivos para vasos), enviado directamente a su domicilio previo al evento.

## **Análisis Comparativo de Infraestructura, Servidores y Pasarelas de Pago**

### **Base de Datos y Autenticación: Supabase vs. Firebase**

| Métrica / Función | Supabase (PostgreSQL) | Firebase (Firestore / GCP) |
| :---- | :---- | :---- |
| **Modelo de Datos** | Relacional con soporte JSONB nativo y SQL completo. | NoSQL orientado a documentos (JSON). |
| **Seguridad y Acceso** | Row Level Security (RLS) declarativo en SQL nativo1. | Firebase Security Rules (Sintaxis propietaria). |
| **Límites Plan Gratuito** | 500 MB base de datos, 50,000 MAU Auth1. Pausa a los 7 días de inactividad1. | 1 GB datos, 50,000 lecturas/día, 20,000 escrituras/día. Sin pausa por inactividad. |
| **Escalabilidad de Precios** | \$25/mes en Pro (incluye 8 GB DB y créditos de cómputo)1. | Pay-As-You-Go por operaciones de lectura/escritura (costos impredecibles en bucles). |
| **Conexiones Realtime** | Hasta 200 conexiones simultáneas (Free) / 500 (Pro) vía WebSockets2. | Conexiones ilimitadas dentro de las cuotas de lectura de documentos. |

**Supabase** es la opción seleccionada debido al rigor del esquema relacional necesario para aislar clientes (*tenants*), la potencia de SQL para agregaciones de datos en tiempo real y la predictibilidad del costo mensual sobre el modelo de facturación por lectura/escritura de Firebase1.

### **Almacenamiento y CDN de Imágenes: R2 \+ Workers vs. AWS S3 vs. Cloudflare Images**

| Solución de Storage | Costo de Almacenamiento | Costo de Transferencia (Egress) | Transformación / Resizing de Imágenes |
| :---- | :---- | :---- | :---- |
| **Cloudflare R2 \+ Workers** | \$0.015 / GB / mes (10 GB gratis)3. | **\$0.00 / GB (Sin costos de transferencia)**3. | Vía Cloudflare Image Resizing API en Workers (\~\$5.40 USD / mes por 100k imágenes / 5M entregas)9. |
| **AWS S3 \+ CloudFront** | \$0.023 / GB / mes. | \$0.085 \- \$0.09 / GB tras superar el tier gratuito de 1 TB. | Requiere infraestructura adicional (AWS Lambda \+ API Gateway) con alto costo de cómputo. |
| **Cloudflare Images** | \$5.00 por cada 100,000 imágenes almacenadas9. | \$1.00 por cada 100,000 imágenes entregadas9. | Incluida automáticamente sin costo extra por variante (hasta 100 variantes)9. |

La combinación de **Cloudflare R2 con Cloudflare Workers** representa la solución más eficiente en costos para la plataforma8. La eliminación total de las tarifas de transferencia de salida (*zero egress*) previene facturas desorbitadas durante eventos donde miles de invitados descargan la galería completa simultáneamente3.

### **Pasarelas de Pago: Stripe vs. Mercado Pago (Chile/LatAm) vs. IAP \+ RevenueCat**

Para la App Mobile del anfitrión y las compras Web, la estrategia de cobro se divide según la plataforma y la geografía:

* **In-App Purchases (iOS / Android) vía RevenueCat**: En las aplicaciones móviles nativas, Apple y Google obligan al uso de sus pasarelas de pago para bienes digitales (compra de créditos de eventos, plantillas premium), aplicando una comisión del 15% (bajo el programa de Pequeños Negocios) o del 30%26. RevenueCat actúa como abstracción SDK, siendo gratuito hasta los \$2,500 USD de ingresos mensuales procesados.  
* **Mercado Pago (América Latina / Chile)**: Para compras en la versión Web en Chile y LatAm, Mercado Pago ofrece integración nativa con tarjetas de crédito, débito y transferencia bancaria local (Webpay / CuentaRUT). Presenta una estructura de comisiones que varía según la disponibilidad del dinero: disponibilidad inmediata con \~3.49% \+ IVA por transacción27, o disponibilidad en 14 días con \~3.19% \+ IVA por transacción.  
* **Stripe (Internacional)**: Para transacciones globales fuera de Latinoamérica en la Web, se aplica una tarifa estándar de 2.9% \+ \$0.30 USD por transacción exitosa.

### **Hosting Web e Infraestructura Backend: Vercel vs. Render vs. Cloudflare Workers**

| Criterio | Vercel | Render.com | Cloudflare Workers |
| :---- | :---- | :---- | :---- |
| **Casos de Uso Ideales** | Aplicaciones Next.js / React, Serverless Edge APIs13. | Contenedores Docker, Servicios de Backend Persistentes13. | Funciones de Borde ultrarrápidas a nivel global (V8 Isolates)4. |
| **Plan Gratuito (Free Tier)** | Generoso para desarrollo no comercial (100 GB Data Transfer)4. | 750 horas de cómputo. **Las instancias gratuitas duermen tras 15 min de inactividad**29. | 100,000 peticiones diarias gratis, límite de 10ms CPU4. |
| **Costo Pro en Producción** | \$20 / usuario / mes \+ sobrecargas de datos11. | Desde \$7 / mes por servicio web continuo sin latencia de inicio en frío. | \$5 / mes (incluye 10M peticiones y 50ms de tiempo CPU)31. |
| **Compatibilidad Backend** | Orientado a ejecuciones efímeras breves (Timeout 10s Hobby / 60s Pro)13. | Soporta WebSockets continuos, colas de tareas y procesos en segundo plano13. | Altamente optimizado para APIs REST/GraphQL ligeras y manipulación de peticiones en CDN4. |

## **Benchmarking de Competencia y Posicionamiento de Producto**

El mercado de soluciones digitales para captura de fotos en eventos se divide entre aplicaciones orientadas a la nostalgia ("cámaras desechables digitales") y plataformas de galerías colectivas para bodas.

| Plataforma | Modelo de Acceso para Invitados | Precio por Evento (USD) | Modo "Burn" / Revelado Diferido | Moderación de Fotos | Transmisión en Vivo (Slideshow) | Impresión de Photobooks |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **POV Camera** | Requiere descarga de App o App Clip32. | \$4.99 a \$99.99 (Según escala de invitados)32. | **Sí** (Concepto analógico central)35. | Limitada. | Requiere paquete "Business" extra33. | No integrada nativamente. |
| **Kululu** | Navegador Web vía QR (Sin App)34. | \$39 (hasta 500 subidas) a \$99 (ilimitado)33. | No (Publicación instantánea)34. | Sí (Panel básico)33. | **Sí** (Muro interactivo optimizado)33. | No. |
| **Wedibox** | Navegador Web vía QR (Sin App)32. | \$29 a \$79 (Incluye extras como RSVP)32. | No. | Básica. | Sí (Solo en planes superiores)33. | No. |
| **Our Event Album** | Navegador Web vía QR (Sin App)32. | \$39 pago único ilimitado32. | No. | No. | Sí. | No. |
| **Burn Camera Platform (Propuesta)** | **Navegador Web \+ iOS App Clip \+ Android Instant App** | **\$0 (Free) / \$19 / \$49 / \$99** | **Sí** (Motor con temporizador dinámico) | **Sí** (Panel jerárquico por roles y lotes) | **Sí** (Servicio WebGL en tiempo real) | **Sí** (Integración directa Gelato/Prodigi API)17 |

### **Propuesta de Valor Diferenciadora**

La plataforma "Burn Camera" combina el *engagement* nostálgico del revelado diferido de POV Camera35 con la velocidad de acceso sin fricción de Kululu34, añadiendo un motor de monetización post-evento (Photobooks y kits físicos) que ninguna plataforma competidora ofrece directamente a través de APIs de impresión automatizada17.

## **Modelo de Monetización, Pricing PLG y Proyección Financiera**

La estrategia de comercialización se basa en el Crecimiento Guiado por el Producto (PLG \- *Product-Led Growth*). El modelo *Freemium* actúa como la herramienta de adquisición viral: cada invitado en un evento es un anfitrión potencial para su propio evento futuro.

### **Estructura de Planes y Precios**

La oferta comercial se estructura en cuatro niveles bien definidos:

| Plan | Precio (USD) | Límite de Invitados | Límite de Fotos | Retención de Galería | Funcionalidades Clave Incluidas |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Freemium PLG** | \$0 USD | 10 personas | 50 fotos (5 por persona) | 7 días | Marcos estáticos básicos, marca de agua de la plataforma. |
| **Starter** | \$19 USD (pago único) | 100 personas | 500 fotos | 30 días | Sin marca de agua, moderación básica, descarga en ZIP. |
| **Pro Event** | \$49 USD (pago único) | 300 personas | 2,000 fotos \+ videos cortos | 1 año | Live Slideshow, marcos dinámicos, moderación por roles. |
| **Enterprise** | \$99 USD (pago único/sub) | Ilimitado | Ilimitadas | Permanente | Marca blanca, dominio propio, \$20 USD de descuento en Photobook. |

### **Estructura de Costos Directos (COGS) por Evento**

El Costo de los Bienes Vendidos (COGS) para un evento bajo el **Plan Pro (\$49 USD)** con el consumo total de su cuota (2,000 fotografías en alta resolución a 4 MB promedio por imagen \= 8 GB de almacenamiento original) se desglosa del siguiente modo:

* Almacenamiento en Cloudflare R2: 8 GB × \$0.015 USD / GB / mes \= \$0.12 USD / mes. Por 12 meses de retención \= **\$1.44 USD**9.  
* Operaciones de Lectura/Escritura R2: 2,000 escrituras (Clase A) \+ 50,000 lecturas (Clase B) \= **\$0.02 USD**3.  
* Transferencia de Salida (*Egress*): Cloudflare R2 \= **\$0.00 USD**3.  
* Fracción de Cómputo e Infraestructura (Supabase/Vercel): Prorrateo por evento \= **\$0.80 USD**.  
* Comisión de Pasarela de Pago (Mercado Pago / Stripe / RevenueCat): \~3.5% \+ \$0.30 USD sobre \$49 USD \= **\$2.015 USD**27.  
* **Costo Total Directo (COGS)**: \$1.44 \+ \$0.02 \+ \$0.80 \+ \$2.015 \= **\$4.275 USD**.

El cálculo del Margen Bruto Directo por Evento Pro resultante es:  
![][image1]

### **Proyección Financiera (Escenario Proyección 12 Meses)**

A medida que la tracción viral del modelo Freemium convierte anfitriones en clientes de pago, la estructura de ingresos y márgenes evoluciona de la siguiente manera:

| Métrica Financiera | Mes 1 \- 3 (Fase MVP) | Mes 4 \- 6 (Lanzamiento) | Mes 7 \- 9 (Escalamiento) | Mes 10 \- 12 (Consolidación) |
| :---- | :---- | :---- | :---- | :---- |
| **Eventos Gratuitos Activos (PLG)** | 50 / mes | 250 / mes | 1,000 / mes | 3,000 / mes |
| **Tasa de Conversión a Pago** | 2.0% | 3.5% | 4.5% | 5.0% |
| **Eventos Pagados Totales** | 1 / mes | 9 / mes | 45 / mes | 150 / mes |
| **Ingresos Brutos Mensuales** | \$49 USD | \$441 USD | \$2,205 USD | \$7,350 USD |
| **Costos Variables (COGS Infra \+ Pagos)** | \$4.28 USD | \$38.48 USD | \$192.38 USD | \$641.25 USD |
| **Costos Fijos Infraestructura (Pro Tiers)** | \$45.00 USD1 | \$45.00 USD1 | \$65.00 USD1 | \$110.00 USD1 |
| **Ganancia Bruta Mensual** | **\$0.28 USD** | **\$357.52 USD** | **\$1,947.62 USD** | **\$6,598.75 USD** |
| **Margen Operativo Bruto (%)** | 0.57% | 81.07% | 88.33% | **89.78%** |

## **Hoja de Ruta Técnica de Desarrollo (Roadmap por Fases)**

### **Fase 1: Núcleo de Infraestructura y Refactorización Multi-Tenant (Semanas 1 \- 4\)**

* **Semana 1**: Creación del nuevo esquema PostgreSQL en Supabase con tablas completas, índices UUID y habilitación estricta de políticas RLS1.  
* **Semana 2**: Migración de la lógica de autenticación de fcumple a Supabase Auth (soporte de inicios de sesión anónimos para invitados y JWT enriquecidos para anfitriones)1.  
* **Semana 3**: Configuración del bucket de Cloudflare R2 y creación de la función en Cloudflare Workers para la firma segura de URLs de subida (*pre-signed URLs*)3.  
* **Semana 4**: Configuración de la estructura *monorepo* utilizando Turborepo con Expo y Next.js compartiendo paquetes de tipos TypeScript y lógica de acceso a la API.

### **Fase 2: Motor de Cámara, App Clips e Interfaz Móvil (Semanas 5 \- 8\)**

* **Semana 5**: Desarrollo del motor gráfico de cámara en React Native (react-native-skia) para iOS/Android y Canvas 2D optimizado para PWA Web.  
* **Semana 6**: Construcción del sistema de superposición de marcos y motor de stickers vectoriales con soporte de arrastre y escala táctil.  
* **Semana 7**: Empaquetado y configuración del blanco **iOS App Clip** (limitado estrictamente a \<15 MB) y **Google Instant App**15.  
* **Semana 8**: Pruebas de campo de captura offline en dispositivos con conectividad intermitente y sincronización en segundo plano.

### **Fase 3: Sistema de Moderación, Revelado "Burn" y Live Slideshow (Semanas 9 \- 12\)**

* **Semana 9**: Desarrollo de la cola de moderación en tiempo real con canales de WebSockets en Supabase Realtime.  
* **Semana 10**: Creación del panel de control para el anfitrión (interfaz tipo tarjeta con gestos de aprobación/rechazo masivo).  
* **Semana 11**: Desarrollo del módulo WebGL para la proyección en vivo (Live Slideshow Wall) con transiciones aceleradas por hardware y superposición dinámica del código QR.  
* **Semana 12**: Pruebas de carga simulando 500 conexiones simultáneas subiendo y descargando imágenes de forma concurrente.

### **Fase 4: Monetización, Integraciones API y Lanzamiento Comercial (Semanas 13 \- 16\)**

* **Semana 13**: Integración del SDK de RevenueCat en la App Mobile y pasarela Mercado Pago / Stripe en la Web26.  
* **Semana 14**: Integración de la API de impresión bajo demanda (Gelato/Prodigi) para la conversión de galerías a Photobooks físicos17.  
* **Semana 15**: Implementación del generador de kits de señalética QR en PDF vectorial a 300 DPI.  
* **Semana 16**: Auditoría de seguridad RLS, optimización de paquetes binarios, despliegue en entornos de producción y lanzamiento del piloto oficial.

## **Conclusiones Estratégicas y Recomendaciones**

El análisis técnico y financiero confirma la viabilidad del proyecto. La combinación de **Cloudflare R2** para el almacenamiento de objetos y **Supabase** para la gestión relacional multi-tenant resuelve las restricciones de escala sin incurrir en costos de transferencia de salida (*egress*), asegurando márgenes brutos superiores al 85% a partir de la fase comercial1.  
La estrategia de acceso mediante **iOS App Clips** y **Google Instant Apps / PWAs** elimina la fricción del usuario final15, convirtiendo a cada invitado en un vector de adquisición orgánica dentro del modelo PLG. Finalmente, la monetización derivada de los servicios adicionales como la impresión de Photobooks bajo demanda e integración de pasarelas locales en Latinoamérica diversifica la captura de valor17. Se recomienda iniciar de inmediato la refactorización de la capa de datos conforme a la Fase 1 del plan de desarrollo1.

#### **Fuentes citadas**

> 1. Supabase Pricing in 2026: Plans, Free Tier Limits & Full Breakdown, [https\://uibakery.io/blog/supabase-pricing](https://uibakery.io/blog/supabase-pricing)  
> 2. Supabase Pricing: 2026 Guide to Plans, Limits, and Real-World Costs, [https\://www\.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)  
> 3. Hosting Your Website on Cloudflare R2 (Free & Scalable Guide), [https\://blog.intertoons.com/hosting-your-website-on-cloudflare-r2-free-scalable-guide-be0f4bcd2834](https://blog.intertoons.com/hosting-your-website-on-cloudflare-r2-free-scalable-guide-be0f4bcd2834)  
> 4. Cloudflare vs Vercel vs Netlify: The Truth about Edge Performance, [https\://dev.to/dataformathub/cloudflare-vs-vercel-vs-netlify-the-truth-about-edge-performance-2026-50h0](https://dev.to/dataformathub/cloudflare-vs-vercel-vs-netlify-the-truth-about-edge-performance-2026-50h0)  
> 5. Pricing & Fees \- Supabase, [https\://supabase.com/pricing](https://supabase.com/pricing)  
> 6. Supabase pricing: plans, free tier, and hidden costs \- CloudZero, [https\://www\.cloudzero.com/blog/supabase-pricing/](https://www.cloudzero.com/blog/supabase-pricing/)  
> 7. Overview · Cloudflare R2 docs, [https\://developers.cloudflare.com/r2/](https://developers.cloudflare.com/r2/)  
> 8. Free Egress Has Fine Print: S3 vs R2, B2, Wasabi and More, [https\://dev.to/devopsdaily/free-egress-has-fine-print-s3-vs-r2-b2-wasabi-and-more-ghf](https://dev.to/devopsdaily/free-egress-has-fine-print-s3-vs-r2-b2-wasabi-and-more-ghf)  
> 9. Cloudflare Images vs Cloudinary: 3-5x Gap \- LeanOps, [https\://leanopstech.com/blog/cloudflare-images-pricing-2026/](https://leanopstech.com/blog/cloudflare-images-pricing-2026/)  
> 10. Vercel Hobby Plan, [https\://vercel.com/docs/plans/hobby](https://vercel.com/docs/plans/hobby)  
> 11. Vercel Pricing: Hobby, Pro, and Enterprise plans, [https\://vercel.com/pricing](https://vercel.com/pricing)  
> 12. Serverless Functions Explained: The Real Vercel Hobby Limits, [https\://www\.natecue.com/en/learn/tech/serverless-functions-explained/](https://www.natecue.com/en/learn/tech/serverless-functions-explained/)  
> 13. Render vs Vercel (2026): Which platform suits your app architecture, [https\://northflank.com/blog/render-vs-vercel](https://northflank.com/blog/render-vs-vercel)  
> 14. Vercel Pricing in 2026: Plans, Credits, and What You'll Actually Pay, [https\://flexprice.io/blog/vercel-pricing-breakdown](https://flexprice.io/blog/vercel-pricing-breakdown)  
> 15. 16KB page size requirements · Issue \#53649 · react/react-native, [https\://github.com/react/react-native/issues/53649](https://github.com/react/react-native/issues/53649)  
> 16. Gelato \- Apps on Google Play, [https\://play.google.com/store/apps/details?id=com.gelato.api](https://play.google.com/store/apps/details?id=com.gelato.api)  
> 17. FAQ: Print API \- Prodigi, [https\://www\.prodigi.com/faq/print-api/](https://www.prodigi.com/faq/print-api/)  
> 18. Getting Started with API Integration | Gelato Create | Help Center, [https\://support.gelato.com/en/articles/8996572-getting-started-with-api-integration](https://support.gelato.com/en/articles/8996572-getting-started-with-api-integration)  
> 19. Creating Products Via API From Template | Help Center, [https\://support.gelato.com/en/articles/8996064-creating-products-via-api-from-template](https://support.gelato.com/en/articles/8996064-creating-products-via-api-from-template)  
> 20. Prodigi API Documentation, [https\://www\.prodigi.com/print-api/docs/reference/](https://www.prodigi.com/print-api/docs/reference/)  
> 21. Get Started \- Gelato API Documentation, [https\://dashboard.gelato.com/docs/get-started/](https://dashboard.gelato.com/docs/get-started/)  
> 22. Gelato Review: Features, Pros & Cons – Forbes Advisor, [https\://www\.forbes.com/advisor/business/software/gelato-print-review/](https://www.forbes.com/advisor/business/software/gelato-print-review/)  
> 23. Gelato Print on Demand Review 2026: Pros, Cons & Verdict, [https\://merchtitans.com/blog/gelato-print-on-demand-review](https://merchtitans.com/blog/gelato-print-on-demand-review)  
> 24. Supabase vs AWS: Feature and Pricing Comparison (2026) | Bytebase, [https\://www\.bytebase.com/blog/supabase-vs-aws-pricing/](https://www.bytebase.com/blog/supabase-vs-aws-pricing/)  
> 25. Cloudflare Images Pricing 2026: Free vs Paid, Remote ... \- Image CDN, [https\://theimagecdn.com/docs/cloudflare-images-pricing](https://theimagecdn.com/docs/cloudflare-images-pricing)  
> 26. In App Purchase Fees 2026: Apple 30%, EU 26%, Google 15%, [https\://appsvaluemobile.com/in-app-purchase-fees/](https://appsvaluemobile.com/in-app-purchase-fees/)  
> 27. Mercado Pago Chile: Qué Es y Cómo Funciona \- Global66, [https\://www\.global66.com/blog/mercado-pago-chile/](https://www.global66.com/blog/mercado-pago-chile/)  
> 28. Railway vs Cloudflare: How Their Architectures Differ and When to, [https\://blog.railway.com/p/railway-vs-cloudflare-how-their-architectures-differ-and-when-to-use-each](https://blog.railway.com/p/railway-vs-cloudflare-how-their-architectures-differ-and-when-to-use-each)  
> 29. Render vs Railway, [https\://render.com/articles/render-vs-railway](https://render.com/articles/render-vs-railway)  
> 30. Deploy for Free – Render Docs, [https\://render.com/docs/free](https://render.com/docs/free)  
> 31. Cloudflare Workers, Deno Deploy, and Vercel Edge | daily.dev, [https\://daily.dev/blog/edge-computing-frontend-developers-cloudflare-workers-deno-deploy-vercel/](https://daily.dev/blog/edge-computing-frontend-developers-cloudflare-workers-deno-deploy-vercel/)  
> 32. POV Camera vs Wedibox \- Our Event Album, [https\://oureventalbum.com/vs/pov-camera-vs-wedibox](https://oureventalbum.com/vs/pov-camera-vs-wedibox)  
> 33. Best event photo sharing apps compared (2026) | PiciMe, [https\://picime.com/en/blog/best-event-photo-sharing-apps](https://picime.com/en/blog/best-event-photo-sharing-apps)  
> 34. Disposable Camera App for Parties: 7 Apps Compared \- Pix Wedding, [https\://www\.pix.wedding/disposable-camera-app-for-parties](https://www.pix.wedding/disposable-camera-app-for-parties)  
> 35. 12 Wedding Photo Sharing Apps Compared (2026): Real Pricing, [https\://easyweddingalbum.com/blog/wedding-photo-sharing-comparison](https://easyweddingalbum.com/blog/wedding-photo-sharing-comparison)  
> 36. Best Disposable Camera Apps 2026: About Last Night vs POV, [https\://www\.aboutlastnight.lol/blog/disposable-camera-app-comparison](https://www.aboutlastnight.lol/blog/disposable-camera-app-comparison)  
> 37. 8 Best Event Photo Sharing Apps in 2026 | Honest Comparison, [https\://shared.click/best-event-photo-sharing-apps](https://shared.click/best-event-photo-sharing-apps)  
> 38. Best Wedding Photo Sharing Apps 2026, Ranked Honestly, [https\://www\.wedding.studio/blog/best-wedding-photo-sharing-apps](https://www.wedding.studio/blog/best-wedding-photo-sharing-apps)  
> 39. Best Wedding Photo Sharing Apps 2026 (Honest Comparison), [https\://pixbearer.com/blog/best-wedding-photo-sharing-apps](https://pixbearer.com/blog/best-wedding-photo-sharing-apps)  
> 40. R2 pricing \- Cloudflare Docs, [https\://developers.cloudflare.com/r2/pricing/](https://developers.cloudflare.com/r2/pricing/)
