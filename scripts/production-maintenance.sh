#!/usr/bin/env bash
# Own-project host maintenance. No installer, proxy action, external message or offsite upload.
set -euo pipefail
umask 077
readonly base=/opt/manzanas-maracay/production
readonly project=manzanas-maracay-production
readonly shared="$base/shared"
readonly envfile="$shared/deploy.env"
readonly mode="${1:-monitor}"
[[ $# -le 1 && "$mode" =~ ^(monitor|backup|scheduled-backup)$ ]] || { printf 'Modo de mantenimiento inválido.\n' >&2; exit 1; }
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ $(id -u) == 0 ]] || fail 'Mantenimiento requiere el operador root autorizado.'
for command in docker realpath stat flock date; do command -v "$command" >/dev/null || fail "Falta $command"; done
for directory in "$base" "$shared"; do
  [[ -d "$directory" && ! -L "$directory" && $(realpath -e -- "$directory") == "$directory" ]] || fail 'Ruta de producción inesperada.'
done
[[ $(stat -c '%u:%a' "$shared") == 0:700 ]] || fail 'El directorio shared debe ser root/0700.'
[[ -f "$envfile" && ! -L "$envfile" && $(stat -c '%u:%a' "$envfile") == 0:600 && $(stat -c '%s' "$envfile") -le 8192 ]] || fail 'El archivo público de despliegue necesita protección 0600.'
seen='|'
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" == *=* ]] || fail 'Formato de variable no admitido; no se ejecuta source/eval.'
  name="${line%%=*}"; value="${line#*=}"
  case "$name" in MM_RELEASE|MM_COMMIT|MM_APP_ORIGIN|MM_NODE_IMAGE|MM_POSTGRES_IMAGE|MM_PRODUCTION_SECRETS_DIR|MM_PRODUCTION_CONTROL_DIR) ;; *) fail 'Variable no autorizada en deploy.env.' ;; esac
  [[ "$seen" != *"|$name|"* && -n "$value" && "$value" != *$'\r'* ]] || fail 'Variable duplicada/vacía o formato incorrecto.'
  seen+="$name|"
  printf -v "$name" '%s' "$value"
  export "$name"
done < "$envfile"
[[ "${MM_COMMIT:-}" =~ ^[a-f0-9]{40}$ && "${MM_RELEASE:-}" == "phase4-${MM_COMMIT:0:12}" ]] || fail 'Release exacta no válida.'
[[ "${MM_APP_ORIGIN:-}" == https://manzanas.ganamosclub.net && "${MM_NODE_IMAGE:-}" =~ ^node@sha256:[a-f0-9]{64}$ && "${MM_POSTGRES_IMAGE:-}" =~ ^postgres@sha256:[a-f0-9]{64}$ ]] || fail 'Origen o imágenes no fijados.'
[[ "${MM_PRODUCTION_SECRETS_DIR:-}" == "$shared/secrets" && "${MM_PRODUCTION_CONTROL_DIR:-}" == "$shared/control" ]] || fail 'Directorios externos fuera de producción.'
readonly release="$base/releases/$MM_RELEASE"
[[ -L "$base/current" && $(realpath -e -- "$base/current") == "$release" && -d "$release" && ! -L "$release" ]] || fail 'current no identifica la release declarada.'
[[ ! -L "$shared/maintenance.lock" ]] || fail 'Lock inesperado.'
exec 9> "$shared/maintenance.lock"
flock -n 9 || exit 0
readonly day="$(TZ=America/Caracas date +%F)"
if [[ "$mode" == scheduled-backup ]]; then
  [[ $(TZ=America/Caracas date +%H) == 01 ]] || exit 0
  if [[ -f "$shared/backup-last-attempt" ]] && [[ $(cat "$shared/backup-last-attempt") == "$day" ]]; then exit 0; fi
fi
readonly stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
statusfile="$shared/monitor-status.json"
[[ "$mode" == monitor ]] || statusfile="$shared/backup-status.json"
stage=identity
success=false
report() {
  local result=$?
  trap - EXIT
  [[ "$stage" =~ ^[a-z-]+$ ]] || stage=failed
  local temporary="$statusfile.tmp.$$"
  if [[ ! -e "$temporary" && ! -L "$temporary" ]]; then
    (set -o noclobber; printf '{"schema":1,"environment":"production","release":"%s","checkedAt":"%s","stage":"%s","passed":%s,"offsiteCopy":"not-checked-by-host"}\n' "$MM_RELEASE" "$stamp" "$stage" "$success" > "$temporary") &&
      mv -T -- "$temporary" "$statusfile"
  fi
  exit "$result"
}
trap report EXIT
api="$(docker ps -q --no-trunc --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=api')"
[[ "$api" =~ ^[a-f0-9]{64}$ ]] || fail 'No se identificó una única API de producción.'
[[ $(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$api") == "$project" &&
   $(docker inspect -f '{{.Config.Image}}' "$api") == "manzanas-maracay-production-api:$MM_RELEASE" ]] || fail 'La API no corresponde a la release activa.'
stage=health
docker exec "$api" node scripts/production-health.mjs api --require-ready >/dev/null || fail 'Salud o activación de producción no verificadas.'
if [[ "$mode" == monitor ]]; then
  stage=backup-freshness
  [[ -f "$shared/backup-last-verified" && ! -L "$shared/backup-last-verified" ]] || fail 'Todavía no hay restauración periódica verificada.'
  verified="$(cat "$shared/backup-last-verified")"
  [[ "$verified" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || fail 'Fecha de restauración no válida.'
  age=$(( $(date -u +%s) - $(date -u -d "$verified" +%s) ))
  [[ "$age" -ge 0 && "$age" -le 129600 ]] || fail 'La última restauración verificada tiene más de 36 horas.'
  stage=healthy
  success=true
  exit 0
fi
printf '%s\n' "$day" > "$shared/backup-last-attempt"
stage=backup
output="$(bash "$release/scripts/production-backup.sh" "$base/backups")"
archive="$(printf '%s\n' "$output" | sed -n 's/^Backup privado creado: //p')"
[[ "$archive" =~ ^/opt/manzanas-maracay/production/backups/manzanas-maracay-production-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}\.dump$ ]] || fail 'No se identificó el respaldo propio.'
stage=restore
bash "$release/scripts/production-restore-check.sh" "$archive" >/dev/null
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$shared/backup-last-verified"
stage=restored
success=true
printf 'Backup propio y ensayo aislado verificados; copia cifrada externa se comprueba por separado.\n'
