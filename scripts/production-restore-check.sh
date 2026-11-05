#!/usr/bin/env bash
# Isolated rehearsal only: does not connect the live DB, networks or volume.
set -euo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $# == 1 && "$1" == /* ]] || fail 'Uso: production-restore-check.sh /respaldo/privado.dump'
for command in docker realpath stat sha256sum od; do command -v "$command" >/dev/null || fail "Falta $command"; done
readonly project=manzanas-maracay-production
readonly database=manzanas_maracay_production
readonly repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly archive="$(realpath -e -- "$1")"
[[ "$archive" == "$1" && ! -L "$1" ]] || fail 'La ruta del respaldo debe ser canónica y sin enlaces.'
case "$archive" in "$repo"|"$repo"/*) fail 'El respaldo debe estar fuera del repositorio.' ;; esac
[[ $(basename -- "$archive") =~ ^manzanas-maracay-production-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}\.dump$ ]] || fail 'El archivo no corresponde a producción.'
for file in "$archive" "$archive.meta"; do
  [[ -f "$file" && ! -L "$file" && $(stat -c '%u:%a' -- "$file") == "$(id -u):600" ]] || fail 'Respaldo/metadatos deben ser privados 0600.'
done
[[ $(stat -c '%u:%a' -- "$(dirname -- "$archive")") == "$(id -u):700" ]] || fail 'El directorio del respaldo debe ser privado 0700.'
[[ $(stat -c '%s' -- "$archive.meta") -le 4096 ]] || fail 'Metadatos excesivos.'
metadata() { awk -F= -v key="$1" '$1==key {value=substr($0,length(key)+2); count++} END {if(count!=1) exit 1; print value}' "$archive.meta"; }
[[ $(metadata format) == 2 && $(metadata project) == "$project" && $(metadata database) == "$database" ]] || fail 'Metadatos fuera de producción.'
readonly image="$(metadata image)"
readonly checksum="$(metadata sha256)"
readonly commit="$(metadata commit)"
readonly binding="$(metadata binding_state)"
readonly instance="$(metadata database_instance_id)"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ && "$checksum" =~ ^[a-f0-9]{64}$ && $(metadata postgres_version) =~ ^18[0-9]{4}$ ]] || fail 'Imagen/versión/huella inválidas.'
[[ "$commit" =~ ^[a-f0-9]{40}$ && $(metadata release) == "phase4-${commit:0:12}" ]] || fail 'Release no verificable.'
[[ ("$binding" == production && "$instance" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$) || ("$binding" == uninitialized && "$instance" == unbound) ]] || fail 'Vínculo de base inválido.'
[[ $(sha256sum -- "$archive" | cut -d ' ' -f 1) == "$checksum" && $(head -c 5 -- "$archive") == PGDMP ]] || fail 'El dump no coincide con su huella/formato.'
docker image inspect "$image" >/dev/null || fail 'Falta la imagen PostgreSQL exacta.'
readonly run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
readonly container="mm-production-restore-$run_id"
readonly volume="$container-data"
readonly logfile="$archive.restore-$run_id.log"
readonly resultfile="$archive.restore-$run_id.ok"
[[ "$container" =~ ^mm-production-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ && "$volume" == "$container-data" ]] || fail 'Identidad temporal inválida.'
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
    if [[ "$container" =~ ^mm-production-restore-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] && owned_container; then
      docker container rm -f "$container" >/dev/null || exit_code=1
    else printf 'Revisar contenedor temporal: identidad ya no coincide.\n' >&2; exit_code=1; fi
  fi
  if $volume_created; then
    if [[ "$volume" == "$container-data" ]] && owned_volume; then
      docker volume rm "$volume" >/dev/null || exit_code=1
    else printf 'Revisar volumen temporal: identidad ya no coincide.\n' >&2; exit_code=1; fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
! docker container inspect "$container" >/dev/null 2>&1 || fail 'Ya existe el contenedor temporal.'
! docker volume inspect "$volume" >/dev/null 2>&1 || fail 'Ya existe el volumen temporal.'
docker volume create --label "org.manzanas-maracay.project=$project" --label "org.manzanas-maracay.restore-run=$run_id" "$volume" >/dev/null
volume_created=true
owned_volume || fail 'No se validó el volumen temporal.'
POSTGRES_PASSWORD="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
[[ "$POSTGRES_PASSWORD" =~ ^[a-f0-9]{64}$ ]] || fail 'No se generó el secreto temporal.'
export POSTGRES_PASSWORD
docker create --name "$container" --network none --read-only \
  --label "org.manzanas-maracay.project=$project" --label "org.manzanas-maracay.restore-run=$run_id" \
  --memory 512m --cpus 1 --pids-limit 100 --security-opt no-new-privileges:true --cap-drop NET_RAW \
  --log-driver json-file --log-opt max-size=2m --log-opt max-file=2 \
  --tmpfs /tmp:size=64m,mode=1777 --tmpfs /var/run/postgresql:size=8m,mode=1777 \
  --mount "type=volume,source=$volume,target=/var/lib/postgresql" \
  --env POSTGRES_PASSWORD --env POSTGRES_USER=mm_prod_bootstrap --env "POSTGRES_DB=$database" \
  "$image" postgres -c max_connections=15 -c shared_buffers=64MB -c log_statement=none >/dev/null
container_created=true
unset POSTGRES_PASSWORD
owned_container || fail 'No se validó el contenedor temporal.'
docker start "$container" >/dev/null
ready=false
for attempt in {1..60}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U mm_prod_bootstrap -d "$database" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
$ready || fail 'PostgreSQL temporal no inició; original intacto.'
set -o noclobber
if ! docker exec -i "$container" psql -X -U mm_prod_bootstrap -d "$database" -v ON_ERROR_STOP=1 > "$logfile" 2>&1 <<'SQL'
CREATE ROLE mm_prod_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mm_prod_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
-- Restore the collector ACL when present in a V4 dump; no live password/login.
CREATE ROLE mm_prod_rates NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
ALTER DATABASE manzanas_maracay_production OWNER TO mm_prod_owner;
ALTER SCHEMA public OWNER TO mm_prod_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE manzanas_maracay_production FROM PUBLIC;
GRANT CONNECT ON DATABASE manzanas_maracay_production TO mm_prod_app;
-- pg_dump without --create does not recover database-level CONNECT. This
-- isolated role stays NOLOGIN; its table/schema ACL still comes from the dump.
GRANT CONNECT ON DATABASE manzanas_maracay_production TO mm_prod_rates;
SQL
then fail 'No se prepararon roles aislados; revisar log privado.'; fi
if ! docker exec -i "$container" pg_restore --username=mm_prod_owner --dbname="$database" \
  --exit-on-error --single-transaction --no-owner < "$archive" >> "$logfile" 2>&1; then
  fail 'Restauración aislada fallida; revisar log privado.'
fi
if [[ "$binding" == production ]]; then
  restored_instance="$(docker exec "$container" psql -X -U mm_prod_owner -d "$database" -Atqc 'SELECT database_instance_id FROM runtime_environment WHERE singleton')"
  [[ "$restored_instance" == "$instance" ]] || fail 'La instancia restaurada no coincide con el respaldo.'
  # Administrative inspection must see every restored row, including any row
  # that FORCE RLS would hide from the owner/application after restoration.
  if ! docker exec -i "$container" psql -X -U mm_prod_bootstrap -d "$database" -v ON_ERROR_STOP=1 \
    < "$repo/scripts/production-verify-restore.sql" >> "$logfile" 2>&1; then fail 'Integridad de restauración fallida; revisar log privado.'; fi
else
  [[ $(docker exec "$container" psql -X -U mm_prod_owner -d "$database" -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','drizzle')") == 0 ]] || fail 'La restauración inicial contiene tablas inesperadas.'
fi
printf 'format=2\nproject=%s\ndatabase=%s\nsha256=%s\nrestore_run=%s\nbinding_state=%s\ndatabase_instance_id=%s\nverified_utc=%s\n' \
  "$project" "$database" "$checksum" "$run_id" "$binding" "$instance" "$(date -u +%Y%m%dT%H%M%SZ)" > "$resultfile"
printf 'Restauración aislada e integridad verificadas. Registro privado: %s\nNo acredita aún copia fuera del VPS.\n' "$logfile"
