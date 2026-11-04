#!/bin/sh
set -eu
test "$POSTGRES_DB" = 'manzanas_maracay_staging'
MM_APP_PASSWORD=$(cat /run/secrets/app_password)
export MM_APP_PASSWORD
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
\getenv app_password MM_APP_PASSWORD
CREATE ROLE mm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
REVOKE CONNECT ON DATABASE manzanas_maracay_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE manzanas_maracay_staging TO mm_app;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
unset MM_APP_PASSWORD
