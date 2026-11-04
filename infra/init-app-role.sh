#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$MM_APP_PASSWORD" <<'SQL'
CREATE ROLE mm_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_password';
REVOKE CONNECT ON DATABASE manzanas_maracay_dev FROM PUBLIC;
GRANT CONNECT ON DATABASE manzanas_maracay_dev TO mm_app;
SQL
