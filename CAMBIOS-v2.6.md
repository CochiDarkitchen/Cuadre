## v2.6 — Actualización automática de la tasa BCV
- Consulta la fuente JSON con valor y fecha de vigencia, con respaldo alternativo.
- Actualiza al abrir, volver a la pestaña, recuperar conexión y cada 30 minutos mientras está abierta.
- Evita depender solo de la fecha de captura; contempla tasas publicadas anticipadamente para el siguiente día hábil.
- Conserva la última tasa válida si no hay conexión y no duplica el historial cuando no cambió el dato.
- La fuente es un servicio independiente que recopila la publicación del BCV; no es un endpoint oficial del BCV. Verificar en producción disponibilidad, frescura y comportamiento de CORS.