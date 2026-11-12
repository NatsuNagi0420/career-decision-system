#!/usr/bin/env bash
# 青穗集 · 官方中转公网验收脚本；只检查健康端点和需要凭证的认证边界。
set -euo pipefail

BASE_URL="${1:?用法: verify-relay.sh https://api.example.com}"
BASE_URL="${BASE_URL%/}"

printf 'healthz: '
curl --connect-timeout 10 --max-time 20 --fail --silent --show-error "${BASE_URL}/healthz"
printf '\n'

printf 'unauthorized boundary: '
STATUS="$(curl --connect-timeout 10 --max-time 20 --silent --output /dev/null --write-out '%{http_code}' "${BASE_URL}/v1/account/usage")"
if [ "${STATUS}" != "401" ]; then
  echo "expected 401, got ${STATUS}" >&2
  exit 1
fi
echo '401 OK'

printf 'relay port exposure is checked separately in the Alibaba Cloud security group; only 80/443 should be public.\n'
