# Cuadre Premium v2.0 — Rediseño UX/UI

## Dirección visual
- Combinación de estética premium, minimalista y fintech moderna.
- Se conserva el sistema de temas claro/oscuro, acentos configurables, densidad, tamaño de texto, privacidad de saldos, contraste y movimiento reducido.
- El logo oficial se muestra como imagen real junto al nombre Cuadre en la cabecera principal y en las pantallas de acceso/carga.

## Experiencia de escritorio y móvil
- En pantallas grandes, la navegación cambia a una barra lateral fija y el área principal aprovecha el espacio disponible.
- En pantallas pequeñas, se conserva la navegación inferior y el contenido fluido.
- Ajustes sutiles de estados hover/focus/active, bordes y estados vacíos, respetando la preferencia de movimiento reducido.
- Se amplía la búsqueda de movimientos para incluir importes y códigos de moneda además de nota, categoría y cuenta.

## Compatibilidad y alcance
- No se cambia el modelo de datos ni los cálculos financieros.
- Se mantienen los flujos de Supabase, autenticación, demostración, exportación, notificaciones y PWA existentes.
- Las preferencias visuales existentes siguen guardándose con las claves actuales.

## Validación
- `node --check app.js` pasa sin errores de sintaxis.
- ZIP revisado mediante prueba de integridad.
- No se afirma una prueba end-to-end con Supabase ni validación visual en todos los navegadores; debe completarse en el entorno publicado.
