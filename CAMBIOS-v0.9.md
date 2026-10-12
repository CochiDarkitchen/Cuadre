# Cambios de Cuadre Premium v0.9

- Recuperación de contraseña mediante código numérico enviado por correo.
- Verificación con Supabase Auth `verifyOtp` de tipo `recovery`.
- Pantalla para establecer y confirmar nueva contraseña después de validar el código.
- Acción para volver a solicitar código y cambiar el correo.
- Mensajes de error más claros para códigos incorrectos o caducados.
- Campo del código con estilo centrado y compatible con autocompletado OTP.
- Guía para modificar la plantilla «Reset Password» de Supabase y usar `{{ .Token }}` sin enlaces.

## Configuración requerida
Para que no se envíe enlace, es imprescindible actualizar la plantilla de recuperación dentro del panel Supabase. Si se conserva la plantilla por defecto con `{{ .ConfirmationURL }}`, seguirá llegando un enlace. Ver `LEEME.md`, apartado «Recuperación de contraseña por código».

## Caché de la PWA

- Se actualizó la versión de caché del service worker a `cuadre-v11` para forzar que las instalaciones PWA descarguen el nuevo flujo de recuperación.
