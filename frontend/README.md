# Frontend

React, TypeScript y Vite. Ejecuta `npm ci` y `npm run dev`. Copia .env.example a .env para configurar el proxy si la API está en Ubuntu. `npm run build` genera dist, que puede servir Express junto con /api y /socket.io.

El login utiliza la identidad visual proporcionada. El resto de las rutas requieren una sesión. El rol se comprueba en cada operación del backend. El token de acceso permanece en memoria y la renovación usa una cookie HttpOnly. El mapa local conserva los límites sin conexión. El mapa base de OpenStreetMap requiere Internet.
