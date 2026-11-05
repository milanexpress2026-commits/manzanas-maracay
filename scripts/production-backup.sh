#!/usr/bin/env bash
# Linux host only. Exact production DB; custom dump stays private, outside the release.
# Encryption/export and offsite verification are separate mandatory activation evidence.
set -euo pipefail
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $# == 1 || ($# == 2 && "$2" == --uninitialized) ]] || fail 'Uso: production-backup.sh /directorio/privado [--uninitialized]'
[[ "$1" == /* ]] || fail 'El destino debe ser absoluto.'
for command in docker realpath stat sha256sum od; do command -v "$command" >/dev/null || fail "Falta $command"; done
readonly project=manzanas-maracay-production
readonly database=manzanas_maracay_production
readonly repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly destination="$(realpath -m -- "$1")"
[[ "$destination" == "$1" && ! -L "$1" ]] || fail 'El destino debe ser canónico y sin enlaces.'
case "$destination" in "$repo"|"$repo"/*) fail 'El backup debe permanecer fuera del repositorio.' ;; esac
[[ "${MM_COMMIT:-}" =~ ^[a-f0-9]{40}$ && "${MM_RELEASE:-}" == "phase4-${MM_COMMIT:0:12}" ]] || fail 'Falta la release exacta de producción.'
mkdir -p -m 700 -- "$destination"
[[ $(stat -c '%u:%a' -- "$destination") == "$(id -u):700" ]] || fail 'El destino debe ser privado 0700 del operador.'
container="$(docker ps -q --no-trunc --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=postgres')"
[[ "$container" =~ ^[a-f0-9]{64}$ ]] || fail 'No hay un único PostgreSQL del proyecto producción.'
[[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container") == "$project" &&
   $(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$container") == postgres &&
   $(docker inspect -f '{{.State.Running}}' "$container") == true ]] || fail 'Identidad PostgreSQL inesperada.'
[[ $(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql"}}{{.Name}}{{end}}{{end}}' "$container") == "${project}_mm_production_pg" ]] || fail 'Volumen fuera del alcance de producción.'
query() { docker exec "$container" psql -X -U mm_prod_owner -d "$database" -Atqc "$1"; }
admin_query() { docker exec "$container" psql -X -U mm_prod_bootstrap -d "$database" -Atqc "$1"; }
[[ $(query "SELECT current_database()||'|'||current_user") == "$database|mm_prod_owner" ]] || fail 'La conexión no usa el owner/base de producción.'
[[ $(query 'SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname=current_user') == f ]] || fail 'El owner debe conservar privilegios limitados.'
[[ $(admin_query "SELECT current_database()||'|'||current_user||'|'||rolsuper FROM pg_roles WHERE rolname=current_user") == "$database|mm_prod_bootstrap|true" ]] || fail 'El respaldo completo requiere el administrador local de esta base.'
[[ $(admin_query "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='mm_prod_app'") == f ]] || fail 'La aplicación debe conservar privilegios limitados.'
readonly image="$(docker inspect -f '{{.Image}}' "$container")"
readonly version="$(query 'SHOW server_version_num')"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ && "$version" =~ ^18[0-9]{4}$ ]] || fail 'Imagen o versión PostgreSQL no admitida.'
binding_state=production
if [[ "${2:-}" == --uninitialized ]]; then
  [[ $(query "SELECT count(*) FROM pg_tables WHERE schemaname IN ('public','drizzle')") == 0 ]] || fail 'La excepción inicial solo admite una base nueva sin tablas.'
  binding_state=uninitialized
  instance=unbound
else
  instance="$(query "SELECT database_instance_id FROM runtime_environment WHERE singleton AND environment='production' AND database_name=current_database() AND owner_role='mm_prod_owner' AND application_role='mm_prod_app' AND purpose='operation'")"
  [[ "$instance" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] || fail 'Falta el vínculo inmutable de esta base de producción.'
fi
readonly created="$(date -u +%Y%m%dT%H%M%SZ)"
readonly suffix="$(od -An -N6 -tx1 /dev/urandom | tr -d ' \n')"
readonly archive="$destination/$project-$created-$suffix.dump"
readonly partial="$archive.partial"
readonly logfile="$archive.backup.log"
partial_created=false
cleanup() {
  if $partial_created && [[ "$partial" == "$destination/$project-$created-$suffix.dump.partial" ]]; then rm -f -- "$partial"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
set -o noclobber
if ! : > "$partial"; then fail 'El archivo parcial ya existe; no se sobrescribió.'; fi
partial_created=true
# FORCE RLS also applies to the owner. A complete disaster-recovery dump must use
# the local bootstrap administrator; --enable-row-security would silently filter it.
if ! docker exec "$container" pg_dump --username=mm_prod_bootstrap --dbname="$database" \
  --format=custom --no-owner --lock-wait-timeout=10s >| "$partial" 2> "$logfile"; then
  fail 'El respaldo falló. Revisar el registro privado; no se imprimieron datos.'
fi
[[ -s "$partial" && $(head -c 5 -- "$partial") == PGDMP ]] || fail 'El resultado no es un dump custom válido.'
[[ ! -e "$archive" ]] || fail 'El destino ya existe; se conservó.'
mv -T --no-clobber -- "$partial" "$archive"
[[ ! -e "$partial" ]] || fail 'No se pudo publicar el archivo exclusivo.'
checksum="$(sha256sum -- "$archive" | cut -d ' ' -f 1)"
printf 'format=2\nproject=%s\ndatabase=%s\nimage=%s\npostgres_version=%s\ncreated_utc=%s\nsha256=%s\nrelease=%s\ncommit=%s\nbinding_state=%s\ndatabase_instance_id=%s\n' \
  "$project" "$database" "$image" "$version" "$created" "$checksum" "$MM_RELEASE" "$MM_COMMIT" "$binding_state" "$instance" > "$archive.meta"
printf 'Backup privado creado: %s\nPendientes: restauración aislada y copia cifrada fuera del VPS.\n' "$archive"
