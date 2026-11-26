# Mi Comunidad Segura

Plataforma académica para registrar y coordinar reportes de emergencias en Cochabamba, Bolivia. El sistema da seguimiento a incidentes, personas, equipos y recursos. Ante una emergencia inmediata, contacta a los servicios oficiales.

| Carpeta | Contenido |
| --- | --- |
| [frontend](frontend/) | React, Vite, TypeScript, diseño adaptable, Leaflet, gráficos y cliente de notificaciones |
| [backend](backend/) | Node.js, TypeScript, Express, sesiones, validación, operaciones, Socket.IO y pruebas |
| [database](database/) | MySQL 8, esquema, catálogos del INE, índices, consultas y modelo ER |

Abre [siste.code-workspace](siste.code-workspace) con VS Code para ver las tres capas en el explorador.

## Instalación en Ubuntu Desktop 26.04

Clona el repositorio en una ruta sin espacios. Los scripts instalan VS Code y preparan un servicio local con Node.js y MySQL.

```bash
git clone https://github.com/tasajos/siste.git
cd siste
sudo bash ops/ubuntu-packages.sh
sudo bash ops/ubuntu-app.sh
code siste.code-workspace
```

La compilación del frontend se sirve desde Express. Abre http://127.0.0.1:3000 dentro de Ubuntu y usa «Crea tu cuenta» para obtener acceso ciudadano. Para crear el primer administrador, abre otra terminal y escribe una contraseña nueva cuando el comando la solicite.

```bash
cd backend
npm run admin -- admin@example.com 'Administración local'
```

## Desarrollo en Windows y Ubuntu

El anfitrión Windows puede consumir la API mediante VirtualBox. La VM UbuntuTrabajo usa NAT para Internet y un adaptador de solo anfitrión para la red privada. En esa configuración, Ubuntu escucha en el puerto 3000 y VirtualBox publica el puerto 3030 del anfitrión en loopback. Para una VM Windows 11, añade la misma red de solo anfitrión como adaptador adicional y usa la dirección privada de Ubuntu.

1. En Ubuntu, configura una IPv4 privada en el adaptador host-only, por ejemplo 192.168.56.20/24. Para preparar el servicio con ese acceso en una instalación nueva, ejecuta `sudo APP_ADDRESS=0.0.0.0 APP_ORIGIN=http://192.168.56.20:3000 bash ops/ubuntu-app.sh`. Si ya existe backend/.env, actualiza allí HOST y CORS_ORIGIN y reinicia el servicio. Restringe el acceso a la red autorizada.
2. En Windows, instala Node.js 22.12 o posterior y Git. Desde frontend, copia .env.example a .env y configura API_PROXY_TARGET con la dirección de Ubuntu alcanzable desde ese equipo. Usa http://127.0.0.1:3030 desde el anfitrión con el reenvío configurado, o http://192.168.56.20:3000 desde la otra VM.
3. Ejecuta `npm ci` y `npm run dev` en frontend. Abre http://localhost:5173. Comprueba el API con `curl.exe http://192.168.56.20:3000/api/v1/health` desde la VM Windows, ajustando la dirección si usas otro adaptador.
4. Conserva MySQL en 127.0.0.1. El proxy de Vite canaliza REST y Socket.IO. En un despliegue con orígenes distintos, configura también VITE_API_URL, VITE_SOCKET_URL y CORS_ORIGIN. Para operar con información real, usa HTTPS, cookies seguras y un origen coherente para la aplicación y la API.

## Uso

- **Ciudadanía** puede registrar y consultar sus emergencias, abrir el mapa, revisar refugios y contactos verificados y leer alertas.
- **Operaciones** puede verificar, asignar responsables, actualizar estados y autorizar alertas con indicaciones públicas. Al crear equipos, registra primero la institución. Crea una operación desde una emergencia y abre su ficha para asignar equipos y recursos. Abre la ficha de una persona para registrar su seguimiento.
- **Equipo autorizado** puede consultar asignaciones, registrar avances e indicar su disponibilidad. Un administrador asigna el rol y el personal operativo vincula la cuenta a un equipo.
- **Administración** gestiona usuarios, permisos y auditoría. El personal autorizado consulta los reportes agregados y exporta CSV. Las fichas de personas se mantienen restringidas.

Las fuentes de los límites de referencia están en [frontend/public/maps/FUENTES.md](frontend/public/maps/FUENTES.md). Registra comunidades y contactos con una fuente verificable. La base inicial contiene catálogos y territorio. El entorno de pruebas genera datos ficticios en un esquema independiente.

## Verificación

```bash
sudo bash ops/test-mysql.sh
systemctl is-active mysql mi-comunidad-segura
curl -fsS http://127.0.0.1:3000/api/v1/health
```

Consulta [arquitectura y pruebas](docs/arquitectura-y-pruebas.md), [la API OpenAPI](backend/openapi.json) y [respaldo de la base](database/README.md).
