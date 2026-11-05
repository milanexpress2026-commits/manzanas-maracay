#!/bin/sh
# Only the new PostgreSQL production cluster invokes this during first initialization.
set -eu
umask 077
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ "${POSTGRES_DB:-}" = manzanas_maracay_production ] || fail 'Base de producción inesperada.'
[ "${POSTGRES_USER:-}" = mm_prod_bootstrap ] || fail 'Bootstrap de producción inesperado.'
for name in owner_password_init app_password_init; do
  file="/run/secrets/$name"
  [ -f "$file" ] && [ ! -L "$file" ] || fail 'Falta un archivo privado de inicialización.'
  [ "$(stat -c '%u:%a' "$file")" = "$(id -u):400" ] || fail 'Permisos de secreto de inicialización incorrectos.'
done
MM_PROD_OWNER_PASSWORD=$(cat /run/secrets/owner_password_init)
MM_PROD_APP_PASSWORD=$(cat /run/secrets/app_password_init)
# Provisioning uses independent 32-byte or larger hexadecimal secrets; no arbitrary SQL text.
case "$MM_PROD_OWNER_PASSWORD" in ''|*[!0-9a-f]*) fail 'Secreto propietario inválido.' ;; esac
case "$MM_PROD_APP_PASSWORD" in ''|*[!0-9a-f]*) fail 'Secreto de aplicación inválido.' ;; esac
[ "${#MM_PROD_OWNER_PASSWORD}" -ge 64 ] && [ "${#MM_PROD_APP_PASSWORD}" -ge 64 ] || fail 'Longitud de secreto insuficiente.'
[ "$MM_PROD_OWNER_PASSWORD" != "$MM_PROD_APP_PASSWORD" ] || fail 'Los roles necesitan secretos distintos.'
export MM_PROD_OWNER_PASSWORD MM_PROD_APP_PASSWORD
psql -X --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
SET log_statement='none';
SET log_min_error_statement='panic';
SET log_parameter_max_length_on_error=0;
\getenv owner_password MM_PROD_OWNER_PASSWORD
\getenv app_password MM_PROD_APP_PASSWORD
BEGIN;
CREATE ROLE mm_prod_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'owner_password';
CREATE ROLE mm_prod_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
ALTER DATABASE manzanas_maracay_production OWNER TO mm_prod_owner;
REVOKE ALL ON DATABASE manzanas_maracay_production FROM PUBLIC;
GRANT CONNECT ON DATABASE manzanas_maracay_production TO mm_prod_app;
ALTER SCHEMA public OWNER TO mm_prod_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
COMMIT;
SQL
unset MM_PROD_OWNER_PASSWORD MM_PROD_APP_PASSWORD
