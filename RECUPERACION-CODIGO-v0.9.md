# Cuadre v0.9 · Recuperación por código

## Qué cambia
- La pantalla «Olvidé mi contraseña» solicita un código por correo en vez de pedir que se abra un enlace.
- Se verifica mediante Supabase Auth `verifyOtp({ email, token, type: 'recovery' })`.
- Tras verificar el código, la aplicación permite establecer y confirmar una contraseña nueva (mínimo 8 caracteres).
- Añade opción para volver a enviar el código y cambiar la dirección de correo.
- Los mensajes de error indican si el código no es válido o ha caducado.

## Configuración obligatoria en Supabase
El cambio de frontend no modifica el email enviado por Supabase. En Authentication → Email Templates → Reset Password, reemplaza `{{ .ConfirmationURL }}` y los enlaces del cuerpo por `{{ .Token }}`. Consulta el HTML listo para copiar en `LEEME.md`.

No guardes códigos, contraseñas ni secretos en localStorage. No se añadió ninguna clave privada al proyecto.

## Verificación recomendada
1. Usar una cuenta de prueba con correo accesible.
2. Solicitar recuperación y comprobar que el correo trae el código, no un enlace.
3. Introducir código incorrecto y comprobar mensaje de error.
4. Introducir código correcto y establecer una contraseña nueva.
5. Iniciar sesión con la nueva contraseña.
6. Confirmar que los flujos de registro e inicio de sesión no cambiaron.
