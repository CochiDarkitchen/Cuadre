# Cuadre v0.6 — Renovación visual premium

## Qué cambió
- Paleta refinada para modo claro y oscuro, manteniendo el verde menta como acento.
- Tipografía, espaciado, radios, bordes y sombras más consistentes.
- Formularios de acceso más claros, campos con estados de foco visibles y mejor jerarquía.
- Botones, tarjetas, movimientos y listas con estados hover/active sutiles.
- Navegación inferior tipo barra flotante, adaptada a móviles y escritorio.
- Mejor uso del ancho en pantallas grandes, sin alterar la estructura de datos.
- Respeto por `prefers-reduced-motion` y por los tamaños de pantalla.
- Conserva el selector existente en Más → Apariencia: Sistema, Claro y Oscuro.

## Compatibilidad
- Se mantienen `schema.sql`, funciones Edge, `service-worker.js`, manifest, iconos y estructura de Supabase.
- Se conserva la configuración actual que estaba en `app.js` al preparar esta entrega. Verifica en privado que la URL de Supabase y la clave publicable correspondan a tu proyecto.
- No se cambió la lógica de registro de movimientos, cuentas, transferencias, presupuestos ni sincronización.

## Publicación
1. Haz una copia de seguridad de tus datos antes de reemplazar archivos.
2. Sube la carpeta completa a GitHub, reemplazando los archivos del mismo nombre.
3. Espera el despliegue de Vercel y recarga con Ctrl+F5.
4. Si ves estilos antiguos, cierra y vuelve a abrir la PWA o limpia la caché del sitio.
5. Prueba el inicio de sesión, cambio de tema, creación de movimiento y sincronización en un usuario de prueba.

Esta entrega es una renovación visual; no implica que las funciones externas de Supabase, push o IA hayan sido probadas contra el proyecto de producción.
