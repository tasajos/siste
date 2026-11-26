#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != 0 || -z "${SUDO_USER:-}" || "$SUDO_USER" == root ]]; then
  echo "Ejecuta sudo bash ops/ubuntu-app.sh desde la cuenta de desarrollo." >&2
  exit 1
fi
project=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
user=$SUDO_USER
group=$(id -gn "$user")
prefer_host=${APP_ADDRESS:-127.0.0.1}
if [[ ! "$prefer_host" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ || "$project" == *[[:space:]]* ]]; then
  echo "Usa una dirección IPv4 y una ruta de proyecto sin espacios." >&2
  exit 1
fi

cat > /etc/mysql/mysql.conf.d/90-comunidad.cnf <<'MYSQL'
[mysqld]
bind-address=127.0.0.1
mysqlx-bind-address=127.0.0.1
default-time-zone=+00:00
MYSQL
systemctl restart mysql
for sql in schema seed indexes; do mysql < "$project/database/$sql.sql"; done

envfile="$project/backend/.env"
if [[ ! -f "$envfile" ]]; then
  dbpass=$(openssl rand -hex 24)
  jwt=$(openssl rand -hex 32)
  mysql <<SQL
CREATE USER IF NOT EXISTS 'comunidad_app'@'127.0.0.1' IDENTIFIED BY '$dbpass';
ALTER USER 'comunidad_app'@'127.0.0.1' IDENTIFIED BY '$dbpass';
GRANT SELECT, INSERT, UPDATE, DELETE ON mi_comunidad_segura.* TO 'comunidad_app'@'127.0.0.1';
SQL
  install -m 0600 -o "$user" -g "$group" /dev/null "$envfile"
  cat > "$envfile" <<ENV
NODE_ENV=production
HOST=$prefer_host
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=comunidad_app
DB_NAME=mi_comunidad_segura
DB_PASSWORD=$dbpass
JWT_SECRET=$jwt
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3030,http://127.0.0.1:3030,${APP_ORIGIN:-http://$prefer_host:3000}
SECURE_COOKIES=false
ENV
fi
for folder in frontend backend; do
  sudo -Hu "$user" bash -c 'cd "$1" && npm ci --no-audit --no-fund && npm run build' _ "$project/$folder"
done
cat > /etc/systemd/system/mi-comunidad-segura.service <<UNIT
[Unit]
Description=Mi Comunidad Segura
After=network-online.target mysql.service
Wants=network-online.target
Requires=mysql.service

[Service]
Type=simple
User=$user
Group=$group
WorkingDirectory=$project/backend
EnvironmentFile=$envfile
ExecStart=/usr/bin/node $project/backend/dist/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable mi-comunidad-segura
systemctl restart mi-comunidad-segura
