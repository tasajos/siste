# Backend

Configura .env a partir de .env.example y aplica los scripts de database. Ejecuta `npm ci` y `npm run dev`. Para ejecución estable usa `npm run build` seguido de `npm start`. La aplicación carga las variables desde el directorio backend.

- Salud de API y MySQL · GET /api/v1/health
- OpenAPI 3.1 · GET /api/v1/openapi.json
- Socket.IO · canal privado por usuario y evento `notificaciones:cambio`. Recupera los mensajes persistidos mediante /api/v1/notificaciones.
- JWT de acceso de 15 minutos y cookie de renovación rotativa de siete días. Las sesiones se revocan de inmediato para la API al cerrar sesión o al cambiar el rol.
- Las fechas de incidentes entran con zona horaria explícita y se guardan en UTC.
- `sudo bash ops/test-mysql.sh`, desde la raíz, prepara una base aislada y ejecuta Vitest con Supertest, Socket.IO y MySQL.
