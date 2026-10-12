# Cuadre Premium v1.0 — Everyday Pro Edition

## Mejoras incluidas

- **Buscador universal:** busca en movimientos, cuentas, categorías, metas, pagos fijos y deudas. Los resultados de movimientos abren el movimiento correspondiente; otras clases llevan a su sección.
- **Calendario financiero mensual:** reúne movimientos registrados, pagos fijos activos y próximas cuotas; permite cambiar el mes y muestra totales de ingresos y gastos registrados. Los pagos futuros se etiquetan como previstos, no como cargos bancarios confirmados.
- **Inicio personalizable:** vista compacta opcional para ocultar proyección y resumen mensual, y control para mostrar/ocultar consejos contextuales. Las preferencias se guardan localmente en el dispositivo.
- **Favoritos de movimientos:** marca hasta 100 movimientos como favoritos y accede a los cuatro primeros desde Inicio. La estrella se guarda en este navegador/dispositivo y no se sincroniza a Supabase.
- **Centro de privacidad y seguridad:** explica el estado de almacenamiento, ofrece acceso a copias de seguridad y accesibilidad, y aclara los límites de ocultar saldos.
- **Diseño adaptable para favoritos** y mantenimiento de la preferencia de movimiento reducido existente.
- **Service worker actualizado** a `cuadre-v12` para evitar servir la versión anterior desde caché.

## Funciones existentes que siguen disponibles

- Entrada rápida con previsualización antes de guardar.
- Importación de movimientos CSV con validación y vista previa, y exportación/restauración JSON.
- Exportación de reportes, adjuntos de recibos, presupuestos, metas, transferencias, pagos, deudas y espacios compartidos.
- Temas claro/oscuro/sistema, ocultar saldos, tamaños de texto, contraste y movimiento reducido.
- Compatibilidad de estructura con Supabase y modo de demostración aislado.

## Notas de alcance

- Las preferencias de inicio y favoritos son locales al navegador.
- El calendario presenta compromisos previstos; no consulta cargos bancarios en tiempo real.
- No se añadió un proveedor de IA externo, conexión bancaria automática ni OCR de recibos: el escaneo inteligente requeriría un servicio adicional o procesamiento específico.
- La aplicación necesita pruebas manuales con el proyecto Supabase real antes de desplegarla con datos financieros importantes.
