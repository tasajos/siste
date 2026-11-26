#!/usr/bin/env bash
set -euo pipefail

# Ejecutar con sudo en Ubuntu Desktop 26.04.
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=3 update
apt-get -o Acquire::Retries=3 install -y --no-install-recommends ca-certificates curl gnupg git nodejs npm mysql-server
install -d -m 0755 /etc/apt/keyrings
curl -fsSL --retry 3 https://packages.microsoft.com/keys/microsoft.asc | gpg --batch --yes --dearmor -o /etc/apt/keyrings/microsoft-vscode.gpg
chmod 0644 /etc/apt/keyrings/microsoft-vscode.gpg
cat > /etc/apt/sources.list.d/vscode.sources <<'SOURCE'
Types: deb
URIs: https://packages.microsoft.com/repos/code
Suites: stable
Components: main
Architectures: amd64
Signed-By: /etc/apt/keyrings/microsoft-vscode.gpg
SOURCE
apt-get -o Acquire::Retries=3 update
apt-get -o Acquire::Retries=3 install -y code
systemctl enable --now mysql
