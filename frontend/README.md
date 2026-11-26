# Frontend

React, TypeScript y Vite. Ejecuta `npm ci` y `npm run dev`. Copia `.env.example` a `.env` para configurar el proxy si la API está en Ubuntu. `npm run build` genera `dist`, que Express puede servir junto con `/api` y `/socket.io`.

Para abrir el servidor de desarrollo desde el anfitrión, define `DEV_HOST=192.168.56.20` en `frontend/.env.local` y ejecuta `npm run dev`. Vite mostrará la dirección de red. Incluye `http://192.168.56.20:5173` en `CORS_ORIGIN` del backend para habilitar el inicio de sesión y las notificaciones desde esa dirección. Ajusta la IP si cambia la interfaz privada de Ubuntu.

El login utiliza la identidad visual proporcionada. El resto de las rutas requieren una sesión. El rol se comprueba en cada operación del backend. El token de acceso permanece en memoria y la renovación usa una cookie HttpOnly. El mapa local conserva los límites sin conexión. El mapa base de OpenStreetMap requiere Internet.
