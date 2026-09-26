#!/usr/bin/env bash
# Поднимает временный локальный PostgreSQL, применяет миграции из db/migrations, seed и матрицу доступа.
# Никогда не подключается к удалённым базам.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$(mktemp -d /tmp/vne-pg.XXXX)"
PORT="${PGTEST_PORT:-54329}"
# initdb запрещён под root: в песочнице сервер запускается от непривилегированного пользователя (uid 1000).
if [ "$(id -u)" = 0 ]; then
  chown lovable "$DIR"; chmod 755 "$DIR"
  RUN() { setpriv --reuid=1000 --regid=1000 --clear-groups "$@"; }
else
  RUN() { "$@"; }
fi
RUN initdb -D "$DIR/data" -U postgres --auth=trust >/dev/null
RUN pg_ctl -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
cleanup() { RUN pg_ctl -D "$DIR/data" stop -m fast >/dev/null || true; rm -rf "$DIR"; }
trap cleanup EXIT
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -A -t)
"${PSQL[@]}" -f "$ROOT/tests/db/supabase-stub.sql"
# Канонический порядок: применённые в Cloud supabase/migrations (db/migrations — исторические черновики).
# Некоторые файлы платформы оставляют открытый BEGIN (enum ADD VALUE → commit; begin;): завершаем его явно.
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  out=$({ cat "$f"; printf '\n;commit;\n'; } | "${PSQL[@]}" 2>&1) || { echo "$out"; echo "FAIL: migration $(basename "$f")"; exit 1; }
  echo "$out" | grep -v "no transaction in progress" || true
done
# seed: синтетический, после финальной схемы
"${PSQL[@]}" -f "$ROOT/db/seed.sql"
"${PSQL[@]}" -f "$ROOT/tests/db/access.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
"${PSQL[@]}" -f "$ROOT/tests/db/staff-rpc.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
# Конкурентный bootstrap: два оператора одновременно; advisory lock должен пропустить ровно одного.
PQ=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -q -A -t)
"${PQ[@]}" -c "begin; select private.bootstrap_first_owner('00000000-0000-4000-a000-0000000000c1'); select pg_sleep(2); commit;" >/dev/null 2>"$DIR/b1.err" &
B1=$!; sleep 0.5
if "${PQ[@]}" -v ON_ERROR_STOP=1 -c "select private.bootstrap_first_owner('00000000-0000-4000-a000-0000000000c2')" >/dev/null 2>"$DIR/b2.err"; then
  B2=ok; else B2=fail; fi
wait $B1 && B1R=ok || B1R=fail
N=$("${PQ[@]}" -c "select count(*) from public.staff_assignments where role='owner'")
if [ "$B1R" = ok ] && [ "$B2" = fail ] && [ "$N" = 1 ] && grep -q "owner already exists" "$DIR/b2.err"; then
  echo "PASS: concurrent bootstrap serialized (first ok, second waited and was rejected, owners=1)"
else echo "FAIL: concurrent bootstrap b1=$B1R b2=$B2 owners=$N"; exit 1; fi
# moderate_application не берёт FOR UPDATE до проверки доступа: при чужой блокировке гость получает 42501, а не ожидание.
"${PQ[@]}" -c "begin; select 1 from public.applications where id='00000000-0000-4000-d000-0000000000a3' for update; select pg_sleep(3); commit;" >/dev/null &
L=$!; sleep 0.5
OUT=$("${PQ[@]}" -c "set lock_timeout='1s'; select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-4000-a000-00000000000a\",\"aal\":\"aal2\",\"session_id\":\"00000000-0000-4000-f000-00000000000a\"}',false); set role authenticated; select public.moderate_application('00000000-0000-4000-d000-0000000000a3','approve',1);" 2>&1 || true)
wait $L
if echo "$OUT" | grep -q "forbidden"; then echo "PASS: unauthorized review denied without waiting on row lock"
else echo "FAIL: review lock order: $OUT"; exit 1; fi
"${PSQL[@]}" -f "$ROOT/tests/db/hardening.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
"${PSQL[@]}" -f "$ROOT/tests/db/audit-fixes.test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
echo "DB ACCESS MATRIX: ALL PASS"
