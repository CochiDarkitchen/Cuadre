# Cuadre Premium v1.2 — Acceso y bienvenida

- Se conserva la pantalla de acceso para visitantes sin sesión, con inicio de sesión, creación de cuenta, recuperación de acceso y demostración con datos ficticios.
- Se incorpora una pantalla de bienvenida animada para usuarios que ya tienen una sesión válida en Supabase.
- La bienvenida permanece visible mientras se cargan los datos y se retira al terminar; no añade una espera artificial después de cargar.
- Si falla la carga y no hay datos en caché, se oculta la bienvenida y se muestra el mensaje de error existente con opción para reintentar.
- Respeta la preferencia del sistema para reducir movimiento.
- No modifica el esquema de Supabase ni la lógica de autenticación.
