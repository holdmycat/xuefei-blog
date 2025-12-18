#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

has_port_arg=false
for arg in "$@"; do
  case "$arg" in
    --port|--port=*|-p|-p*)
      has_port_arg=true
      break
      ;;
  esac
done

pick_port() {
  local port
  for port in 1313 1314 1315 1316 1317 1318 1319 1320 1321 1322 1323; do
    if command -v lsof >/dev/null 2>&1; then
      if ! lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
        echo "${port}"
        return 0
      fi
    else
      if ! nc -z 127.0.0.1 "${port}" >/dev/null 2>&1; then
        echo "${port}"
        return 0
      fi
    fi
  done
  echo "Unable to find a free port in 1313-1323." >&2
  return 1
}

extra_args=()
if [ "${has_port_arg}" = false ]; then
  extra_args+=(--port "$(pick_port)")
fi

cmd=(
  hugo
  server
  --source "${ROOT_DIR}/blog"
  --buildDrafts
  --buildFuture
  --disableFastRender
)

if [ "${#extra_args[@]}" -gt 0 ]; then
  cmd+=("${extra_args[@]}")
fi

cmd+=("$@")

exec "${cmd[@]}"
