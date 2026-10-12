# Cuadre Premium v0.7 — Motion Edition

## Animaciones incluidas

- Transiciones de entrada suaves al cambiar de vista.
- Conteo visual del saldo principal durante la entrada a Inicio (el valor final mostrado sigue siendo el calculado por Cuadre).
- Barras animadas para presupuestos y metas.
- Animación al abrir formularios, mensajes de confirmación y metas completadas.
- Cambio de tema con transición de colores, sin cambiar la preferencia guardada.
- Botón flotante `+` animado con tres opciones: Gasto, Ingreso y Transferir.
- Cierre del panel de acciones rápidas con Escape o al pulsar fuera del panel.
- Respeto por la preferencia de accesibilidad `prefers-reduced-motion`.

## Verificaciones

Se comprobaron la sintaxis de `app.js` y `service-worker.js`, la estructura HTML y la integridad del archivo ZIP. La capa de animación usa CSS y JavaScript nativo, sin añadir bibliotecas de animación. No se ejecutó una prueba E2E contra las credenciales reales de Supabase; antes de desplegar, prueba inicio de sesión, registro de movimientos, tema claro/oscuro y las tres acciones rápidas.
