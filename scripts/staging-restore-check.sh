#!/usr/bin/env bash
# Rehearsal only: never connects to the original DB or attaches its volume/network.
set -euo pipefail
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $# == 1 && "$1" == /* ]] || fail 'Uso: bash scripts/staging-restore-check.sh /respaldo/privado.dump'
for command in docker realpath stat sha256sum od; do
  command -v "$command" >/dev/null || fail "Falta la herramienta: $command"
done
readonly project='manzanas-maracay-staging'
readonly database='manzanas_maracay_staging'
readonly repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly archive="$(realpath -e -- "$1")"
case "$archive" in "$repo"|"$repo"/*) fail 'El respaldo debe estar fuera del repositorio.' ;; esac
[[ $(basename -- "$archive") =~ ^manzanas-maracay-staging-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}\.dump$ ]] ||
  fail 'El nombre no corresponde a un respaldo de este proyecto.'
for file in "$archive" "$archive.meta"; do
  [[ -f "$file" && ! -L "$file" && $(stat -c '%u' -- "$file") == "$(id -u)" && $(stat -c '%a' -- "$file") == 600 ]] ||
    fail 'El respaldo y los metadatos deben ser archivos privados 0600 del usuario actual.'
done
[[ $(stat -c '%a' -- "$(dirname -- "$archive")") == 700 ]] || fail 'El directorio de respaldo debe tener permisos 0700.'
[[ $(stat -c '%s' -- "$archive.meta") -le 2048 ]] || fail 'Metadatos inesperados.'
metadata() {
  # Parse data, never source/eval a file next to a dump.
  awk -F= -v key="$1" '$1==key {value=substr($0,length(key)+2); count++} END {if(count!=1) exit 1; print value}' "$archive.meta"
}
[[ $(metadata format) == 1 && $(metadata project) == "$project" && $(metadata database) == "$database" ]] ||
  fail 'Los metadatos no corresponden al staging autorizado.'
readonly image="$(metadata image)"
readonly checksum="$(metadata sha256)"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ && "$checksum" =~ ^[a-f0-9]{64}$ && $(metadata postgres_version) =~ ^18[0-9]{4}$ ]] ||
  fail 'La imagen, versión o huella del respaldo no es válida.'
[[ $(sha256sum -- "$archive" | cut -d ' ' -f 1) == "$checksum" ]] || fail 'El checksum del respaldo no coincide.'
[[ $(head -c 5 -- "$archive") == PGDMP ]] || fail 'El archivo no tiene formato custom.'
docker image inspect "$image" >/dev/null || fail 'Falta la imagen PostgreSQL exacta del respaldo. Recupérala antes de ensayar.'

readonly run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
readonly container="mm-staging-restore-$run_id"
readonly volume="$container-data"
readonly logfile="$archive.restore-$run_id.log"
readonly resultfile="$archive.restore-$run_id.ok"
[[ "$container" =~ ^mm-staging-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && "$volume" == "$container-data" ]] || fail 'Nombre temporal inválido.'
container_created=false
volume_created=false
owned_volume() {
  [[ $(docker volume inspect -f '{{index .Labels "org.manzanas-maracay.project"}}' "$volume" 2>/dev/null) == "$project" &&
     $(docker volume inspect -f '{{index .Labels "org.manzanas-maracay.restore-run"}}' "$volume" 2>/dev/null) == "$run_id" ]]
}
owned_container() {
  [[ $(docker inspect -f '{{index .Config.Labels "org.manzanas-maracay.project"}}' "$container" 2>/dev/null) == "$project" &&
     $(docker inspect -f '{{index .Config.Labels "org.manzanas-maracay.restore-run"}}' "$container" 2>/dev/null) == "$run_id" ]]
}
cleanup() {
  local exit_code=$?
  trap - EXIT
  set +e
  if $container_created; then
    if [[ "$container" =~ ^mm-staging-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] && owned_container; then
      docker container rm -f "$container" >/dev/null || exit_code=1
    else
      printf 'No se eliminó el contenedor: su identidad ya no coincide.\n' >&2
      exit_code=1
    fi
  fi
  if $volume_created; then
    if [[ "$volume" == "$container-data" ]] && owned_volume; then
      docker volume rm "$volume" >/dev/null || exit_code=1
    else
      printf 'No se eliminó el volumen: su identidad ya no coincide.\n' >&2
      exit_code=1
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
! docker container inspect "$container" >/dev/null 2>&1 || fail 'El nombre temporal de contenedor ya existe.'
! docker volume inspect "$volume" >/dev/null 2>&1 || fail 'El nombre temporal de volumen ya existe.'
docker volume create --label "org.manzanas-maracay.project=$project" \
  --label "org.manzanas-maracay.restore-run=$run_id" "$volume" >/dev/null
volume_created=true
owned_volume || fail 'No se pudo validar el volumen propio.'
# An unrelated, ephemeral secret; it never appears in arguments, output or a file.
POSTGRES_PASSWORD="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
[[ "$POSTGRES_PASSWORD" =~ ^[a-f0-9]{64}$ ]] || fail 'No se pudo crear el secreto temporal.'
export POSTGRES_PASSWORD
docker create --name "$container" --network none --read-only \
  --label "org.manzanas-maracay.project=$project" --label "org.manzanas-maracay.restore-run=$run_id" \
  --memory 512m --cpus 1 --pids-limit 100 --security-opt no-new-privileges:true --cap-drop NET_RAW \
  --log-driver json-file --log-opt max-size=2m --log-opt max-file=2 \
  --tmpfs /tmp:size=64m,mode=1777 --tmpfs /var/run/postgresql:size=8m,mode=1777 \
  --mount "type=volume,source=$volume,target=/var/lib/postgresql" \
  --env POSTGRES_PASSWORD --env POSTGRES_USER=mm_owner --env "POSTGRES_DB=$database" \
  "$image" postgres -c max_connections=15 -c shared_buffers=64MB -c log_statement=none >/dev/null
container_created=true
unset POSTGRES_PASSWORD
owned_container || fail 'No se pudo validar el contenedor propio.'
docker start "$container" >/dev/null
ready=false
for attempt in {1..60}; do
  # Wait for the final server; initdb's temporary server has no TCP listener.
  if docker exec "$container" pg_isready -h 127.0.0.1 -U mm_owner -d "$database" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
$ready || fail 'PostgreSQL temporal no inició; no se tocó el original.'
set -o noclobber
if ! docker exec -i "$container" pg_restore --username=mm_owner --dbname="$database" \
  --exit-on-error --single-transaction --no-owner --no-privileges < "$archive" > "$logfile" 2>&1; then
  fail "La restauración temporal falló. Registro privado: $logfile"
fi
if ! docker exec -i "$container" psql -X -U mm_owner -d "$database" -v ON_ERROR_STOP=1 >> "$logfile" 2>&1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout='60s';
DO $$
DECLARE required_table text;
BEGIN
  IF current_database()<>'manzanas_maracay_staging' THEN RAISE EXCEPTION 'Unexpected database'; END IF;
  FOREACH required_table IN ARRAY ARRAY['fruits','varieties','calibers','packing_rules','suppliers','purchases','purchase_lines','lots','containers','stock_balances','inventory_movements','inventory_entries','audit_events','app_users','auth_sessions','auth_login_buckets'] LOOP
    IF to_regclass('public.'||required_table) IS NULL THEN RAISE EXCEPTION 'Missing application table'; END IF;
  END LOOP;
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN RAISE EXCEPTION 'Missing migration history'; END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated) THEN
    RAISE EXCEPTION 'Unvalidated constraint';
  END IF;
  IF EXISTS(
    SELECT 1 FROM containers c LEFT JOIN stock_balances s ON s.container_id=c.id
    LEFT JOIN LATERAL (SELECT after_state FROM inventory_entries WHERE container_id=c.id ORDER BY entry_order DESC LIMIT 1) e ON true
    WHERE s.id IS NULL OR e.after_state IS NULL
      OR (e.after_state->>'quantity')::integer IS DISTINCT FROM s.quantity
      OR e.after_state->>'unit' IS DISTINCT FROM s.unit
      OR (e.after_state->>'countedPieces')::integer IS DISTINCT FROM s.counted_pieces
      OR (e.after_state->>'version')::integer IS DISTINCT FROM s.version
      OR e.after_state->>'state' IS DISTINCT FROM c.state
      OR e.after_state->>'kind' IS DISTINCT FROM c.kind
      OR (e.after_state->>'parentId')::uuid IS DISTINCT FROM c.parent_id
  ) THEN RAISE EXCEPTION 'Restored stock and last event disagree'; END IF;
  IF EXISTS(
    SELECT 1 FROM stock_balances s LEFT JOIN LATERAL
      (SELECT sum(quantity_delta) AS quantity FROM inventory_entries WHERE container_id=s.container_id AND unit=s.unit) e ON true
      WHERE coalesce(e.quantity,0)<>s.quantity
    UNION ALL
    SELECT 1 FROM inventory_entries e JOIN stock_balances s ON s.container_id=e.container_id
      WHERE e.unit<>s.unit GROUP BY e.container_id,e.unit HAVING sum(e.quantity_delta)<>0
  ) THEN RAISE EXCEPTION 'Restored stock and accumulated movements disagree'; END IF;
  IF EXISTS(
    SELECT 1 FROM lots l LEFT JOIN LATERAL
      (SELECT count(*) AS total,count(DISTINCT lot_version_after) AS versions,max(lot_version_after) AS last_version
       FROM inventory_movements WHERE lot_id=l.id) m ON true
    WHERE l.inventory_version<>coalesce(m.last_version,0) OR m.total<>l.inventory_version OR m.versions<>m.total
  ) THEN RAISE EXCEPTION 'Restored lot history disagrees'; END IF;
END $$;
SELECT 'lots' AS object,count(*) AS restored_rows FROM lots
UNION ALL SELECT 'movements',count(*) FROM inventory_movements
UNION ALL SELECT 'containers',count(*) FROM containers
UNION ALL SELECT 'users',count(*) FROM app_users;
COMMIT;
SQL
then fail "La verificación de integridad falló. Registro privado: $logfile"; fi
printf 'project=%s\ndatabase=%s\nsha256=%s\nrestore_run=%s\nverified_utc=%s\n' \
  "$project" "$database" "$checksum" "$run_id" "$(date -u +%Y%m%dT%H%M%SZ)" > "$resultfile"
printf 'Restauración e integridad verificadas en un contenedor aislado. Registro privado: %s\n' "$logfile"
