# Cuadre Premium v0.8 — Welcome Edition

## Novedades

- Bienvenida guiada de cuatro pasos: presentación, moneda de visualización, prioridad personal y cierre con opción de crear el primer movimiento. La guía se puede saltar o repetir desde Apariencia/Ayuda.
- Modo de demostración con cuentas, movimientos, presupuestos, pagos y metas ficticios. El estado de demostración se guarda bajo una clave local separada y desactiva temporalmente las escrituras a Supabase. El botón “Salir de la demostración” devuelve al modo habitual.
- Ayuda contextual: consejo acerca de transferencias y una guía que explica los cálculos de saldo, dinero disponible, proyección mensual y cambio de tasa.
- Estado informativo del guardado/sincronización y botón de reintento cuando corresponde. El indicador no sustituye pruebas transaccionales en el servidor.
- Opción de deshacer durante 10 segundos después de crear un movimiento desde el formulario o entrada rápida. Solo elimina ese movimiento recién creado; no deshace pagos, ediciones ni transferencias.
- Entrada rápida se puede interpretar con Enter; la vista previa sigue requiriendo confirmación.
- Preferencias locales de apariencia: tamaño de texto, ocultar visualmente los saldos, reducir animaciones y mayor contraste.
- Atajos de teclado: `/` enfoca la búsqueda en Movimientos y `?` abre la guía fuera de campos de edición.
- Se añadió soporte CSS para modo de movimiento reducido, controles más visibles, preferencia de fuente y diálogo de bienvenida accesible.
- El service worker utiliza `cuadre-v10` para renovar la caché de la PWA.

## Límites y consideraciones

- La demostración genera datos al entrar y los mantiene separados del almacenamiento habitual. No es un entorno de servidor ni una cuenta de prueba remota.
- “Ocultar saldos” es una máscara visual, no un control de acceso; desactívala antes de exportar o copiar información si necesitas leerla.
- El indicador “guardado local” describe el almacenamiento del navegador. En modo nube, una hora de guardado local no garantiza por sí sola que una operación remota se haya confirmado si otra parte del flujo falló.
- El botón de deshacer solo funciona para el último movimiento creado disponible y durante 10 segundos. Requiere conexión en modo nube.
- Si Supabase no carga al arrancar, la pantalla de error ofrece entrar en demostración sin conexión.
- La preferencia de ocultar saldos usa el mismo manejador de cambios que los demás controles de apariencia.
- La configuración de Supabase y las claves públicas ya presentes se conservan. No se incorporan claves privadas.
- No se ha ejecutado contra la instancia real de Supabase del propietario; probar inicio de sesión, recuperación, importación/exportación, modo demo, sincronización y datos de prueba antes de usar información importante.
