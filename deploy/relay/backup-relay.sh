#!/usr/bin/env bash
# 青穗集 · 通过官方 relay CLI 生成 SQLite 备份；执行前确认环境文件权限为 0600。
set -euo pipefail
umask 077

APP_DIR="/opt/qingsuiji/app/agent"
BACKUP_DIR="/var/backups/qingsuiji/relay"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="${BACKUP_DIR}/relay-${STAMP}.sqlite"

install -d -o qingsuiji -g qingsuiji -m 0700 "${BACKUP_DIR}"
cd "${APP_DIR}"
runuser -u qingsuiji -- /usr/local/bin/node dist/relay/relay-token.js backup "${TARGET}"
chown qingsuiji:qingsuiji "${TARGET}"
chmod 0600 "${TARGET}"
find "${BACKUP_DIR}" -type f -name 'relay-*.sqlite' -mtime +14 -delete
