#!/usr/bin/env bash
# Run on the Linux Docker host. No credentials, dumps or private logs belong in Git.
set -euo pipefail
umask 077

fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $# == 1 && "$1" == /* ]] || fail 'Uso: bash scripts/staging-backup.sh /directorio/privado/externo'
for command in docker realpath stat sha256sum od; do
  command -v "$command" >/dev/null || fail "Falta la herramienta: $command"
done
readonly project='manzanas-maracay-staging'
readonly database='manzanas_maracay_staging'
readonly repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly destination="$(realpath -m -- "$1")"
case "$destination" in "$repo"|"$repo"/*) fail 'El respaldo debe quedar fuera del repositorio.' ;; esac
mkdir -p -m 700 -- "$destination"
[[ $(stat -c '%u' -- "$destination") == "$(id -u)" && $(stat -c '%a' -- "$destination") == 700 ]] ||
  fail 'El directorio de respaldo debe pertenecer al usuario actual y tener permisos 0700.'

# Compose must use the explicit project, even if COMPOSE_PROJECT_NAME is set elsewhere.
container="$(docker compose --project-name "$project" -f "$repo/compose.staging.yaml" ps -q postgres)"
[[ "$container" =~ ^[a-f0-9]{64}$ ]] || fail 'No se encontró un único PostgreSQL de staging en ejecución.'
[[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container") == "$project" &&
   $(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container") == postgres &&
   $(docker inspect -f '{{.State.Running}}' "$container") == true ]] || fail 'Las etiquetas del contenedor no corresponden al staging autorizado.'
actual="$(docker exec "$container" psql -X -U mm_owner -d "$database" -Atqc 'SELECT current_database()')"
[[ "$actual" == "$database" ]] || fail 'La base de datos no corresponde al staging autorizado.'
readonly image="$(docker inspect -f '{{.Image}}' "$container")"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || fail 'No se pudo identificar la imagen PostgreSQL.'
readonly version="$(docker exec "$container" psql -X -U mm_owner -d "$database" -Atqc 'SHOW server_version_num')"
[[ "$version" =~ ^18[0-9]{4}$ ]] || fail 'Este procedimiento requiere PostgreSQL 18.'
readonly created="$(date -u +%Y%m%dT%H%M%SZ)"
readonly suffix="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
readonly archive="$destination/$project-$created-$suffix.dump"
readonly partial="$archive.partial"
readonly logfile="$archive.backup.log"
partial_created=false
cleanup() {
  # This is one exact generated file, never a directory or a wildcard.
  if $partial_created && [[ "$partial" == "$destination/$project-$created-$suffix.dump.partial" ]]; then
    rm -f -- "$partial"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
set -o noclobber
if ! : > "$partial"; then fail 'El archivo parcial ya existe; se conservó sin cambios.'; fi
partial_created=true
if ! docker exec "$container" pg_dump --username=mm_owner --dbname="$database" \
  --format=custom --no-owner --no-privileges --lock-wait-timeout=10s >| "$partial" 2> "$logfile"; then
  fail "No se completó el respaldo. Revisa el registro privado: $logfile"
fi
[[ -s "$partial" && $(head -c 5 -- "$partial") == PGDMP ]] || fail 'El resultado no es un archivo custom válido.'
[[ ! -e "$archive" ]] || fail 'El destino ya existe; no se sobrescribió.'
mv -T --no-clobber -- "$partial" "$archive"
[[ ! -e "$partial" ]] || fail 'No se pudo publicar el respaldo sin sobrescribir otro archivo.'
checksum="$(sha256sum -- "$archive" | cut -d ' ' -f 1)"
printf 'format=1\nproject=%s\ndatabase=%s\nimage=%s\npostgres_version=%s\ncreated_utc=%s\nsha256=%s\n' \
  "$project" "$database" "$image" "$version" "$created" "$checksum" > "$archive.meta"
printf 'Respaldo privado creado: %s\nEjecuta staging-restore-check.sh con este archivo antes de considerarlo recuperable.\n' "$archive"
