# Cuadre Premium v2.7 — tasa BCV y escritorio

- Añadido parámetro de consulta único a las solicitudes de tasa para reducir respuestas antiguas servidas desde cachés intermedias, manteniendo `cache: no-store`.
- Ajustada la distribución de escritorio: reserva espacio real para la navegación lateral y evita que reglas de padding posteriores empujen el contenido debajo del menú.
- Conservados el diseño móvil, los temas y el comportamiento existente.

## Nota sobre la tasa
La tasa y su fecha efectiva dependen de la fuente externa. Si la fuente devuelve una tasa antigua, Cuadre no puede inventar una tasa nueva; por eso la consulta usa una URL no cacheada y muestra la fecha de vigencia reportada por el proveedor.
