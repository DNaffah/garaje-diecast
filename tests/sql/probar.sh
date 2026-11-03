#!/usr/bin/env bash
# Prueba docs/supabase-cuentas.sql en un PostgreSQL local y desechable (puerto 54329, solo
# en 127.0.0.1). Corre el script dos veces para comprobar que se puede repetir.
set -euo pipefail
cd "$(dirname "$0")"
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DATOS=$(mktemp -d)
PSQL=(psql -h 127.0.0.1 -p 54329 -U postgres -d postgres -q -v ON_ERROR_STOP=1)
como() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DATOS"
como "$BIN/initdb -D $DATOS -U postgres -A trust >/dev/null"
como "$BIN/pg_ctl -D $DATOS -o '-p 54329 -k /tmp -c listen_addresses=127.0.0.1' -l $DATOS/log -w start >/dev/null"
trap 'como "$BIN/pg_ctl -D $DATOS stop -m fast >/dev/null"; rm -rf "$DATOS"' EXIT
"${PSQL[@]}" -f auth-falso.sql >/dev/null
"${PSQL[@]}" -f ../../docs/supabase-cuentas.sql >/dev/null 2>&1
"${PSQL[@]}" -f ../../docs/supabase-cuentas.sql >/dev/null 2>&1
"${PSQL[@]}" -t -f pruebas.sql | grep -v '^\s*$' | tail -1
