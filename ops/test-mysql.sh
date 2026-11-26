#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" != 0 || -z "${SUDO_USER:-}" || "$SUDO_USER" == root ]]; then
  echo "Ejecuta sudo bash ops/test-mysql.sh desde la cuenta de desarrollo." >&2
  exit 1
fi
project=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
suffix=$(openssl rand -hex 5)
name="comunidad_${suffix}_test"
account="test_$suffix"
secret=$(openssl rand -hex 24)
jwt=$(openssl rand -hex 32)
cleanup() {
  mysql -e "DROP USER IF EXISTS '$account'@'127.0.0.1'; DROP DATABASE IF EXISTS $name;"
}
trap cleanup EXIT
for sql in schema seed indexes; do
  sed "s/mi_comunidad_segura/$name/g" "$project/database/$sql.sql" | mysql
done
mysql <<SQL
CREATE USER '$account'@'127.0.0.1' IDENTIFIED BY '$secret';
GRANT SELECT, INSERT, UPDATE, DELETE ON $name.* TO '$account'@'127.0.0.1';
SQL
sudo -Hu "$SUDO_USER" env NODE_ENV=test DB_NAME="$name" DB_USER="$account" DB_PASSWORD="$secret" JWT_SECRET="$jwt" bash -c 'cd "$1/backend" && npm test' _ "$project"
