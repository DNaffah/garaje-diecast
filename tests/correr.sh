#!/usr/bin/env bash
# Corre una prueba con un Supabase falso recién arrancado (sin intentos ni cuentas viejas).
# Antes hay que tener wrangler sirviendo el sitio en 127.0.0.1:8788 (ver docs/TESTING.md).
# Uso: tests/correr.sh tests/cuentas.cjs carpeta-de-capturas
set -euo pipefail
pkill -f "supabase-falso.cjs" 2>/dev/null || true
node "$(dirname "$0")/supabase-falso.cjs" 54321 > /dev/null 2>&1 &
FALSO=$!
trap 'kill $FALSO 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:54321/__estado && break; sleep 0.2; done
node "$1" "${2:-capturas}"
