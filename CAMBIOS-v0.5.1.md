# Cuadre v0.5.1 — mejoras de planificación y datos

## Incluido en el código

- Panel de saldo total, objetivos de ahorro reservados, obligaciones de los próximos 30 días y disponible estimado.
- Proyección simple de cierre de mes basada en el promedio neto diario del mes actual.
- Presupuestos que muestran gasto del período, cuánto queda y proyección al cierre; alerta textual si el ritmo va por encima de lo esperado.
- Historial de tasas y estimación referencial del efecto cambiario ya contemplados en reportes.
- Aportes a metas con historial de movimientos; en nube el aporte se registra por una función SQL transaccional para que el historial y el total ahorrado se actualicen juntos.
- Distribución de ingresos por porcentajes, validada para sumar exactamente 100 %.
- Copia JSON descargable/copiable y restauración mediante archivo o texto.
- Importación CSV con vista previa, validación de fecha/monto/moneda/cuenta/categoría, confirmación explícita y sin borrar movimientos existentes.
- Espacio de gastos familiares separado del libro personal, códigos de invitación temporales con límite de uso y políticas RLS para miembros, propietario y movimientos.
- Suscripciones Web Push propias por usuario, tabla protegida por RLS, log de entregas y emisor Supabase Edge Function `send-reminders`; plantilla opcional para Cron/Vault. Las notificaciones en la pantalla bloqueada son genéricas para evitar exponer importes o conceptos.
- Asistente financiero con respuestas locales y una Supabase Edge Function opcional para consultas mediante IA. El resumen enviado al proveedor se limita a cifras agregadas y no incluye notas ni movimientos individuales. Los movimientos propuestos necesitan confirmación.
- Bump de caché del service worker a `cuadre-v9` para entregar los archivos actualizados.
- Limpieza de lectura de deudas repetida y corrección del reconocimiento de divisa desde texto CSV.

## Requiere configuración externa

- Configurar URL y clave pública `anon` de Supabase en `app.js`.
- Ejecutar el `schema.sql` completo en Supabase antes de utilizar los nuevos campos/tablas/RPC.
- Configurar URLs de confirmación y recuperación en Supabase Auth.
- Para IA, desplegar `supabase/functions/financial-assistant` y guardar `OPENAI_API_KEY` como secreto de Supabase, nunca en el frontend.
- Para recordatorios push automáticos cuando la app está cerrada, configura la clave pública VAPID en `app.js`, guarda las claves y el secreto del emisor en Supabase, despliega `send-reminders` con `--no-verify-jwt` y activa la plantilla Cron/Vault. Esto no se activa automáticamente al publicar el ZIP.

## Verificación realizada

- `node --check app.js` y `node --check service-worker.js`.
- Revisión estática de la función Edge de IA y el emisor de Web Push; no se pudo ejecutar Deno ni desplegarlas contra un proyecto del usuario.
- Verificación de referencias a `app.js`, versión de caché y archivos incluidos.
- Inspección estática de la capa de datos, tablas, RPC y políticas RLS.
- Creación y verificación de integridad del ZIP final.

## Fuera del alcance de la validación actual

- No se conectó con las credenciales del usuario; el ZIP no contiene claves.
- No se ejecutó `schema.sql` en un proyecto Supabase real, ni se verificó el envío real de correos, la API IA o notificaciones push.
- Debes probar las operaciones con cuentas de prueba y crear una copia de los datos antes de migrar.
