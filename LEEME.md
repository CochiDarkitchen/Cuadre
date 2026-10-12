# Cuadre Premium v2.4 · Experiencia pulida

## Cambios de esta versión
- Pulido visual global de tarjetas, campos, botones, navegación, avisos y paneles.
- Estados de foco más claros para teclado y formularios.
- Mejor legibilidad, espaciado y respuesta táctil en móvil y escritorio.
- Estados vacíos con mejor jerarquía visual y navegación inferior más refinada.
- Respeta la preferencia de reducir movimiento.
- No se modificaron la lógica financiera, las tablas ni la integración de Supabase.

# Cuadre Premium v0.9 · Recovery Code Edition

Cuadre es una aplicación web instalable (PWA) para registrar ingresos, gastos, cuentas en VES/USD, pagos, presupuestos, metas y planificación financiera.

## Archivos

| Archivo | Función |
|---|---|
| `index.html` | Interfaz y estilos. |
| `app.js` | Lógica principal y configuración pública de Supabase. |
| `schema.sql` | Esquema, migraciones y políticas de seguridad/RLS. |
| `service-worker.js` | Caché de la PWA y recepción de mensajes push ya enviados por un proveedor. |
| `manifest.json`, `icons/` | Instalación e iconos. |
| `supabase/functions/financial-assistant/index.ts` | Función opcional para respuestas con IA. |
| `supabase/functions/send-reminders/index.ts` | Emisor programado de avisos push. |
| `supabase/cron-push-reminders.sql.template` | Plantilla opcional para programar el emisor con Cron/Vault. |

## 1. Uso local

Abre `index.html` en un navegador moderno para una prueba sencilla. En modo local, la información queda guardada solo en el almacenamiento de ese navegador/dispositivo. No se sincroniza a otros equipos y no debe tratarse como copia de seguridad por sí sola. Para instalar la PWA y usar funciones de navegador como el service worker, publica el sitio por HTTPS.

## 2. Conectar Supabase

1. Crea un proyecto en Supabase.
2. En `SQL Editor`, pega y ejecuta **todo** `schema.sql`. El script incluye las tablas existentes y las migraciones de esta versión; no lo sustituyas solo por el bloque v0.5.
3. En `app.js`, al comienzo del archivo, configura únicamente la URL del proyecto y la clave pública `anon`/`publishable`:

```js
var CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_CLAVE_PUBLICA_ANON',
  VAPID_PUBLIC_KEY: 'CLAVE_PUBLICA_VAPID' // opcional; nunca añadas la privada aquí
};
```

**Nunca pongas una clave `service_role`, contraseña de base de datos ni clave de proveedor IA en `app.js`.** Las claves públicas solo son seguras si se mantienen las políticas RLS de `schema.sql`.

4. En Supabase → Authentication → URL Configuration, configura `Site URL` y las `Redirect URLs` que correspondan a la dirección HTTPS publicada. Para recuperación de contraseña, incluye la URL exacta de la app.
5. Publica la carpeta completa por HTTPS (por ejemplo, Netlify, Cloudflare Pages o un hosting estático similar). No subas solo `index.html`; hacen falta el resto de archivos y `icons/`.
6. Al actualizar una instalación existente, usa todos los archivos de esta entrega. `service-worker.js` está en `cuadre-v11`; no reutilices una caché antigua manualmente. Puede ser necesario cerrar y reabrir la PWA o recargarla dos veces.

Antes de migrar, exporta una copia JSON desde `Más → Copias e importación` en la versión que ya usas.

## Recuperación de contraseña por código (v0.9)

Cuadre ahora solicita un código numérico en la pantalla de recuperación, verifica ese código con Supabase Auth (`verifyOtp` con tipo `recovery`) y luego permite elegir una contraseña nueva. Para que el correo contenga **solo el código y no un enlace**, debes cambiar una plantilla en el panel de Supabase: el código del navegador no puede cambiar el contenido del correo por sí solo.

1. En Supabase abre **Authentication → Email Templates → Reset Password** (puede aparecer como recuperación de contraseña).
2. Cambia el asunto por `Tu código para recuperar Cuadre`.
3. Reemplaza el cuerpo de la plantilla por este HTML, eliminando la variable `{{ .ConfirmationURL }}` y cualquier enlace anterior:

```html
<h2>Recuperar acceso a Cuadre</h2>
<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>
<p>Introduce este código en Cuadre:</p>
<h1 style="letter-spacing: .25em;">{{ .Token }}</h1>
<p>Si no solicitaste este cambio, ignora este correo. No compartas el código con nadie.</p>
```

4. Guarda la plantilla y confirma que **Site URL** y las URL permitidas estén configuradas en **Authentication → URL Configuration**.
5. Prueba con una cuenta controlada: pulsa `Olvidé mi contraseña`, solicita el código, introdúcelo en Cuadre y crea una contraseña nueva. Si un usuario solicita códigos repetidamente, espera el intervalo que indique Supabase.

La pantalla admite códigos numéricos de 6 a 8 dígitos para permitir variaciones de configuración de Auth. El código es de un solo uso y puede caducar. Si no llega, comprueba Spam y la configuración de correo de tu proyecto. En proyectos Supabase con restricciones de envío, puede ser necesario configurar un proveedor SMTP propio.

**Alcance:** esta actualización cambia el flujo de recuperación de contraseña. La confirmación inicial de una cuenta recién creada conserva su plantilla y método actuales; si también deseas confirmar nuevos registros con código, habrá que adaptar por separado la plantilla de confirmación y ese flujo.

## 3. Qué incluye v0.5.1

- Panel con saldo total, metas reservadas, obligaciones previstas de los próximos 30 días y dinero estimado para gastar.
- Proyección orientativa de saldo de cierre de mes basada en el promedio neto diario observado.
- Presupuestos con ritmo de gasto y proyección para el cierre.
- Historial de tasas y estimación de su efecto referencial; las variaciones de cambio no se contabilizan como ingresos ni gastos.
- Metas de ahorro con aportes registrados. Un aporte reserva dinero para una meta; no mueve dinero entre cuentas ni crea un gasto.
- Distribución de ingresos en necesidades, inversión, disfrute, ahorro y emergencias. Los porcentajes deben sumar 100 %; no se aparta dinero automáticamente.
- Exportación de copias JSON; en modo local la restauración reemplaza el estado local actual. En modo nube la importación intenta sumar los elementos válidos y omitir los duplicados/invalidos que detecta. Haz una copia antes de importar.
- Importación de CSV con vista previa. El formato debe incluir una columna fecha y una columna monto, o débito/crédito. La moneda y tasa aplicada deben comprobarse antes de confirmar. Los formatos de fecha ambiguos se interpretan como día/mes/año.
- Espacios familiares: un libro de gastos compartidos independiente, invitaciones con caducidad/límite de usos y políticas RLS. Los gastos familiares no cambian los saldos personales automáticamente y no concede acceso a movimientos, recibos ni cuentas privadas de los integrantes.
- Asistente local para consultas básicas y una propuesta de registro rápido que exige confirmación. Puede conectarse a la función de IA opcional de abajo.

## 4. Configurar el asistente con IA (opcional)

Sin configuración de IA, las preguntas comunes usan respuestas locales. Para activar las respuestas con modelo:

1. Instala/configura Supabase CLI en tu equipo y vincula la carpeta de funciones a tu proyecto.
2. Define el secreto **en Supabase**, nunca dentro de los archivos web:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase secrets set OPENAI_API_KEY="TU_CLAVE_OPENAI"
supabase secrets set OPENAI_MODEL="gpt-4.1-mini"
supabase functions deploy financial-assistant
```

La función usa la sesión válida de Supabase y envía al proveedor IA la pregunta y un resumen agregado de cifras/presupuestos/metas, no el listado de movimientos, las notas individuales, recibos, email ni identificadores de cuenta. La solicitud a Responses API especifica `store: false`; aun así, revisa siempre las políticas vigentes del proveedor antes de usarla con datos financieros. La IA no debe autorizar ni realizar movimientos: Cuadre requiere confirmación del usuario.

No se incluye ninguna clave de API en el ZIP. Para desplegar la función necesitas conexión de red y las herramientas/credenciales de tu propio proyecto.

## 5. Configurar avisos push con la app cerrada (opcional)

Los avisos push son opcionales y no funcionan hasta completar todos estos pasos. Para probarlos usa una app publicada por HTTPS, un navegador que admita Web Push y un proyecto Supabase configurado.

1. Genera un par de claves VAPID en tu equipo:

```bash
npx web-push generate-vapid-keys
```

2. Copia **solo la clave pública** en `CONFIG.VAPID_PUBLIC_KEY` al principio de `app.js`. Guarda la clave privada fuera de los archivos web. En Supabase CLI define los secretos del servidor:

```bash
supabase secrets set VAPID_PUBLIC_KEY="TU_CLAVE_PUBLICA"
supabase secrets set VAPID_PRIVATE_KEY="TU_CLAVE_PRIVADA"
supabase secrets set VAPID_SUBJECT="mailto:TU_CORREO_DE_CONTACTO"
supabase secrets set PUSH_SCHEDULER_SECRET="UN_SECRETO_LARGO_ALEATORIO"
supabase functions deploy send-reminders --no-verify-jwt
```

Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al entorno de sus Edge Functions. No expongas la clave privada ni el secreto del planificador. La función de envío exige `x-scheduler-secret` y usa la clave administrativa solo en servidor.

3. En la app, inicia sesión y ve a `Más → Avisos → Avisos con la app cerrada`; pulsa **Activar / desactivar avisos push en este dispositivo** y concede permiso al navegador. Esto registra la suscripción con políticas RLS para que cada usuario solo administre la suya.

4. Habilita las extensiones `pg_cron`, `pg_net` y Vault en Supabase. Guarda `PUSH_SCHEDULER_SECRET` en Vault bajo el nombre `cuadre_push_scheduler_secret` (por ejemplo, con `select vault.create_secret('TU_SECRETO_LARGO_ALEATORIO', 'cuadre_push_scheduler_secret', 'Secreto del cron de Cuadre');`). Edita `supabase/cron-push-reminders.sql.template`, reemplaza `PROJECT_REF`, ajusta la hora cron a tu zona horaria y ejecuta el SQL en Supabase SQL Editor.

La plantilla programa un envío diario (por defecto 13:00 UTC, equivalente a las 09:00 en Venezuela cuando se usa UTC−4); cambia la hora si prefieres otro horario. Cada ejecución agrupa los avisos del usuario en una notificación genérica; por privacidad, no muestra cantidades ni nombres en la pantalla bloqueada. `push_delivery_log` ayuda a evitar duplicados ese día. Si no necesitas push, no tienes que desplegar estas funciones.

## 6. Seguridad y límites importantes

- Recuperar contraseña, nube, sincronización y familia necesitan un proyecto Supabase configurado y el `schema.sql` ejecutado.
- No se probó esta entrega contra tu propio proyecto Supabase; las políticas y funciones SQL deben verificarse en un proyecto de prueba antes de usar datos importantes.
- Los avisos locales se revisan al abrir la app. El envío push con app cerrada ya trae la base de suscripciones y el emisor `send-reminders`, pero **no queda activo automáticamente**: debes configurar VAPID, desplegar la función y programarla con Cron.
- La proyección de fin de mes es una estimación simple basada en el promedio de lo registrado durante el mes. No es una garantía y puede ser poco útil con pocos movimientos.
- El “dinero disponible para gastar” es una estimación contable: saldo mostrado menos reservas de metas y pagos próximos. Una reserva de meta no equivale a separar el dinero físicamente en el banco.
- La importación CSV utiliza una heurística genérica; revisa la vista previa, categorías, moneda y fechas. No importa transferencias de bancos como movimientos de transferencia interna automáticamente.
- El espacio compartido administra un libro familiar básico; no fusiona balances personales ni sustituye asesoría legal/contable. Comparte el código de invitación solo con personas autorizadas.
- Guarda una copia JSON fuera del navegador con regularidad. No subas copias de datos reales a sitios públicos.

## 7. Novedades v0.8 — bienvenida y facilidad de uso

- Primera visita: guía opcional de 4 pasos. La moneda elegida es solo de visualización y no cambia las cuentas ni mueve fondos. Puedes saltar o repetir la guía.
- Modo demostración: entra desde la pantalla de acceso o Más → Modo demostración. Usa datos ficticios y un almacén local separado; el botón de salida vuelve al estado/configuración anterior. Aun así, comprueba que la barra de demostración esté visible antes de practicar.
- Ayuda y primeros pasos explica de forma breve cómo se calcula el saldo, el disponible estimado, la proyección y el efecto referencial de la tasa.
- En Inicio aparece un indicador informativo de sincronización/guardado y un consejo que puedes descartar. Los indicadores no reemplazan una copia de seguridad.
- Después de crear un movimiento nuevo, puedes pulsar “Deshacer” dentro de los 10 segundos siguientes. El deshacer está limitado a movimientos nuevos de gasto/ingreso y no revierte pagos programados, transferencias ni modificaciones de registros existentes.
- La Entrada rápida se puede interpretar con Enter y todavía muestra una previsualización antes de guardarse.
- Más → Apariencia permite ajustar tamaño de texto, ocultar visualmente saldos, reducir animaciones y activar mayor contraste. “Ocultar saldos” es privacidad visual únicamente.
- Atajos: `/` para enfocar la búsqueda en Movimientos y `?` para abrir la guía cuando no se escribe en un campo.
- La bienvenida se marca por usuario/navegador; nuevos usuarios pueden repetirla desde Apariencia o Ayuda.

## 8. Novedades v0.8 — experiencia inicial y accesibilidad

- La guía de bienvenida puede saltarse y repetirse. Solo guarda moneda de visualización y una preferencia para los consejos iniciales; no hace movimientos ni ajusta porcentajes automáticamente.
- El modo demostración incluye importes y movimientos inventados. La bandera “Demostración” se muestra para reducir confusiones y salir devuelve al modo de la app anterior. No introduzcas allí datos reales.
- Si la conexión con Supabase falla al abrir, la pantalla de error también deja entrar al modo demostración sin escribir en la nube.
- Apariencia permite tema claro/oscuro/sistema, texto pequeño/normal/grande, ocultar saldos, movimiento reducido y contraste reforzado. Estas opciones se guardan solo en el dispositivo.
- En algunos registros nuevos de ingresos/gastos aparece un botón de deshacer durante 10 segundos. No equivale a una restauración de datos ni revierte transferencias o pagos programados.
- El indicador de nube especifica que se actualizó la copia local de una cuenta en la nube; no garantiza que una operación remota esté confirmada por el solo hecho de mostrar una hora. Revisa siempre los mensajes de guardado y errores.
- El atajo `/` abre la búsqueda en Movimientos y `?` abre la guía cuando no se está escribiendo en un campo.

## 9. Pruebas recomendadas antes de usar datos reales

1. Crea un usuario de prueba y dos cuentas, una VES y otra USD.
2. Registra gastos e ingresos; verifica que las transferencias no aparezcan en reportes como gasto/ingreso.
3. Configura una meta, añade un aporte y comprueba que baja el disponible estimado pero no crea una transacción.
4. Crea un presupuesto, agrega un gasto y revisa la proyección.
5. Exporta una copia JSON, usa un navegador/perfil de prueba y restaura la copia.
6. Importa un CSV de muestra y valida fechas, moneda, cuenta y categoría en la vista previa.
7. Con dos usuarios de prueba, crea un espacio e invita al segundo; comprueba que el segundo solo ve el libro familiar compartido y sus propios datos personales.
8. Despliega la función de IA opcional y confirma que devuelve una respuesta; luego confirma que una propuesta solo se guarda al pulsar “Confirmar y guardar”.
9. Con un navegador de prueba, configura claves VAPID y suscríbelo; después prueba manualmente `send-reminders` con `x-scheduler-secret` y solo entonces habilita Cron.

Si una prueba falla, no uses datos reales hasta investigar la causa.


## Cuadre Premium v0.7 — Motion Edition

Esta versión añade una capa de movimiento sutil y ligera a la interfaz:

- Entrada breve de contenidos al cambiar de pantalla y respuesta visual al guardar movimientos o actualizar metas.
- Animación de lectura del saldo y llenado de barras de presupuestos/metas.
- Panel del botón `+` con acciones rápidas para registrar gasto, ingreso o transferencia; se cierra al pulsar Escape o fuera del panel.
- Transiciones suaves al cambiar entre tema claro y oscuro, y al abrir formularios.
- Respeto de `prefers-reduced-motion`: las animaciones decorativas se desactivan cuando el dispositivo solicita movimiento reducido.

No se han cambiado las fórmulas financieras ni el esquema de persistencia para añadir las animaciones. Tras sustituir los archivos, prueba en un entorno de desarrollo el inicio de sesión, registrar un movimiento, cambiar de tema, abrir/cerrar el formulario y usar el botón `+` antes de publicar en producción.


## Actualización v1.0 — Everyday Pro Edition

Esta versión añade un buscador universal desde **Más → Buscar en Cuadre**, un calendario desde **Más → Calendario financiero**, preferencias de inicio en **Más → Personalizar inicio**, favoritos de movimientos y un centro de privacidad y seguridad. Los favoritos y las preferencias de inicio se guardan en el navegador actual; no se sincronizan entre dispositivos. El calendario agrupa movimientos reales por fecha y pagos futuros previstos, sin afirmar que un banco los haya procesado.

Antes de publicar, sube los archivos del ZIP al repositorio, espera el despliegue y fuerza la recarga de la app. Prueba inicio de sesión, búsqueda, calendario, favoritos, registro de movimientos, importación CSV y exportación/restauración con datos de prueba. El service worker usa ahora `cuadre-v12`. Consulta `CAMBIOS-v1.0.md` para ver el alcance y las limitaciones de esta versión.


## Actualización v1.1 — Refined Experience

Esta actualización incorpora un sistema global de apariencia configurable sin cambiar el modelo de datos financieros ni la integración con Supabase:

- **Tema inicial oscuro**, con opciones Oscuro, Claro y Sistema en Más → Apariencia y accesibilidad. La selección queda guardada en el navegador.
- **Color de acento configurable:** Menta (predeterminado), Esmeralda o Azul. Los tokens CSS se aplican a botones, estados activos, barras de progreso y otros componentes que utilizan el acento global.
- **Densidad configurable:** Cómoda (predeterminada, con más espacio) o Compacta (más contenido visible).
- Las preferencias de acento y densidad se guardan junto a las preferencias de accesibilidad existentes en `cuadre:ui-prefs:v1`. No requieren cambios en Supabase ni en `schema.sql`.
- Se mantiene el tamaño de texto, ocultar saldos, reducir animaciones y mayor contraste. También se respeta `prefers-reduced-motion`.
- Se actualizó la caché del service worker a `cuadre-v13` para que el navegador detecte los archivos renovados.

**Validación recomendada antes de publicar:** cambia entre los tres temas, recarga y confirma que se conserva la elección; cambia cada color de acento y densidad, recarga y comprueba que se mantienen; verifica foco de teclado, formularios, botones y lectura en móvil. La preferencia de apariencia se guarda localmente por navegador/dispositivo y no se sincroniza entre dispositivos.

## v1.2 — Acceso y bienvenida

Al abrir Cuadre sin una sesión válida de Supabase se muestra la pantalla de acceso existente. Si Supabase confirma que ya hay una sesión, Cuadre muestra una bienvenida animada mientras recupera los datos y luego abre la aplicación. La animación respeta la preferencia del sistema para reducir movimiento y no retrasa la app una vez que los datos están listos. La demostración sigue separada de las finanzas reales.


## Actualización UX/UI v2.0

Esta versión incorpora un refinamiento visual premium/minimalista/fintech, cabecera con el logo oficial, una navegación lateral adaptable en escritorio y búsqueda de movimientos por monto. Se mantienen los temas y preferencias de apariencia existentes, junto con la estructura de Supabase y el modo de demostración. Consulta `CAMBIOS-v2.0.md` para el resumen.


## v2.1 — Refinamiento visual
Se añadieron mejoras de jerarquía visual, estados de foco accesibles, transiciones discretas, estados hover, ajuste responsive y respeto reforzado por `prefers-reduced-motion`. No se modificó la lógica financiera ni el esquema de Supabase.

## v2.2 — Experiencia de inicio
- Nueva cabecera de bienvenida y acceso visible para registrar un movimiento.
- Accesos rápidos a nuevo movimiento, movimientos y pagos.
- Selector de moneda con etiquetas más claras.
- Tarjeta de saldo con mayor jerarquía visual y mejor lectura del disponible estimado.
- Resumen mensual en bloques más fáciles de comparar.
- Ajustes responsive para móvil estrecho y escritorio; respeta la preferencia de movimiento reducido.
- No se modificaron los cálculos financieros, la estructura de datos ni la integración con Supabase.


## Versión 2.3 — Inicio más claro
- Eliminados los accesos duplicados a Nuevo movimiento y Ver movimientos del inicio; la navegación inferior sigue siendo el punto principal de acceso.
- Retirado el estado de sincronización de la parte superior del inicio; permanece en Más y en Privacidad y seguridad.
- El selector de moneda y la tarjeta de saldo total quedan al principio para priorizar el saldo.
- Refinados tamaño, espaciado y lectura de la tarjeta de saldo en móvil y escritorio.
- Sin cambios en el esquema de datos ni en la lógica financiera o de Supabase.

## v2.6 — Actualización automática de la tasa BCV
- Consulta la fuente JSON con valor y fecha de vigencia, con respaldo alternativo.
- Actualiza al abrir, volver a la pestaña, recuperar conexión y cada 30 minutos mientras está abierta.
- Evita depender solo de la fecha de captura; contempla tasas publicadas anticipadamente para el siguiente día hábil.
- Conserva la última tasa válida si no hay conexión y no duplica el historial cuando no cambió el dato.
- La fuente es un servicio independiente que recopila la publicación del BCV; no es un endpoint oficial del BCV. Verificar en producción disponibilidad, frescura y comportamiento de CORS.


## v2.7
Correcciones de consulta de tasa BCV con parámetro anti-caché y ajustes de maquetación para pantallas de escritorio. Consulta `CAMBIOS-v2.7.md`.
