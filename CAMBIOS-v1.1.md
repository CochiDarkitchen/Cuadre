# Cuadre Premium v1.1 — Refined Experience

## Apariencia configurable
- Tema oscuro predeterminado; opciones Sistema, Claro y Oscuro.
- Selector global de acento: Menta, Esmeralda y Azul.
- Selector de densidad: Cómoda y Compacta; Cómoda es la opción predeterminada.
- Persistencia local mediante `localStorage`, sin migración de base de datos ni cambios en Supabase.
- Integración con las preferencias existentes de tamaño de texto, ocultar saldos, movimiento reducido y alto contraste.
- Refuerzo de `prefers-reduced-motion` en CSS.
- Service worker actualizado a `cuadre-v13`.

## Archivos modificados
- `index.html`: carga inicial de preferencias sin destello de tema y tokens CSS de acento/densidad.
- `app.js`: valores predeterminados, aplicación/guardado de preferencias y controles de apariencia.
- `service-worker.js`: versión de caché.
- `LEEME.md`: documentación y pasos de prueba.

No se cambiaron las tablas, políticas ni credenciales de Supabase.
