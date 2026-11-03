#!/usr/bin/env bash
# Levanta el sitio como en Cloudflare, pero en este equipo y contra el Supabase falso.
# Todo escucha solo en 127.0.0.1. Ctrl+C para apagar.
# Requiere wrangler (npm i --prefix .herramientas wrangler@3.114.17).
set -euo pipefail
cd "$(dirname "$0")/.."
WRANGLER="${WRANGLER:-.herramientas/node_modules/.bin/wrangler}"
exec "$WRANGLER" pages dev sitio --ip 127.0.0.1 --port 8788 --compatibility-date 2024-11-01 \
  --binding SUPABASE_URL=http://127.0.0.1:54321 \
  --binding SUPABASE_CLAVE_PUBLICA=sb_publishable_prueba \
  --binding SUPABASE_CLAVE_SECRETA=sb_secret_prueba \
  --binding MODO_PRUEBA=1
