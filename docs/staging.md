# Vista previa de Manzanas Maracay

Dominio confirmado por el propietario: `https://manzanas.ganamosclub.net`. Esta guía describe únicamente el entorno de pruebas. El estado comprobado, versión y resultados se registran en la entrega de fase 2; confirmar allí si la URL ya está disponible.

## Recursos exclusivos

- Directorio del servidor: `/opt/manzanas-maracay/staging`.
- Proyecto Compose: `manzanas-maracay-staging`.
- Base: `manzanas_maracay_staging`; propietario de migraciones `mm_owner` y aplicación `mm_app` sin superusuario.
- Volumen `manzanas-maracay-staging_mm_staging_pg` y redes `database`, `application`, `edge` propias del proyecto.
- PostgreSQL y API sin puertos publicados. La web inicial escucha solamente en `127.0.0.1:33100` del servidor.
- PostgreSQL/API con 512 MiB cada uno y web con 384 MiB; una CPU por servicio. Reinicios limitados y health checks. Aplicaciones sin privilegios, con sistema de archivos de solo lectura y temporales acotados.
- Base independiente de desarrollo, pruebas automatizadas y futura producción. Toda recepción en staging queda marcada DEMO. No hay facturación, cobros externos, WhatsApp ni BCV en vivo.

## Secretos e invitaciones

`shared/secrets` está fuera de los releases y del repositorio; su carpeta debe ser privada (0700). Contiene contraseñas diferentes de propietario/app, token interno e invitación inicial. Los tres secretos aleatorios requieren al menos 32 caracteres. No escribirlos en Compose, argumentos del terminal, logs, screenshots, GitHub ni el chat.

Compose monta archivos individuales de secretos. El token interno y la invitación pertenecen al UID 1000 y usan modo 0400; las contraseñas de PostgreSQL permiten lectura dentro de sus montajes. Aunque sus archivos sean legibles dentro del contenedor, la carpeta 0700 impide que usuarios ajenos del host los recorran. La API recibe solo su contraseña y el token interno, la web solo el token, y el migrador los accesos de administración. Consultar [documentación oficial de secretos Compose](https://docs.docker.com/compose/how-tos/use-secrets/).

La invitación inicial se realiza con el servicio de herramientas, sin endpoint público de registro. Más personas se invitan mediante el procedimiento administrativo de [autenticación](authentication.md), con contraseñas distintas entregadas por un canal privado elegido por el propietario.

## Desplegar una versión verificada

Los comandos siguientes son para un operador con SSH, desde el release ya comprobado. El archivo privado `shared/staging.env` contiene únicamente `MM_RELEASE`, `MM_APP_ORIGIN` y `MM_SECRETS_DIR`; no contraseñas. `MM_RELEASE` debe identificar el commit/código, sin sobrescribir una etiqueta anterior.

```sh
docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml --profile tools config --quiet
COMPOSE_PARALLEL_LIMIT=1 nice -n 15 docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml --profile tools build
docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml up -d --wait postgres
docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml --profile tools run --rm --no-deps migrate migrate
# Solo al crear una invitación nueva (no repetir para el mismo usuario):
docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml --profile tools run --rm --no-deps migrate invite
docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml up -d --wait api web
```

Antes de actualizar: ejecutar typecheck, unitarios, build y E2E; respaldar la base propia y registrar imágenes previas. Inspeccionar el diff para excluir secretos. La compilación utiliza Node 24 y PostgreSQL 18.6; el volumen de PostgreSQL 18 se monta en `/var/lib/postgresql` según la [imagen oficial](https://hub.docker.com/_/postgres).

## HTTPS y proxy compartido

`infra/caddy-staging.snippet` contiene solamente el host nuevo. Se debe agregar al archivo existente, conservando su contenido anterior, después de comprobar su hash, guardar respaldo privado y validar la configuración completa. El proxy necesita acceso a la red `manzanas-maracay-staging_edge` para resolver `mm-staging-web`; no necesita las redes internas de la API o de la base.

La adición del registro A de `manzanas` al VPS, la conexión del proxy a esa red y la recarga de Caddy requieren aprobación específica del propietario. No reemplazar configuraciones ni reiniciar servicios ajenos. Una recarga validada usa el mecanismo de [Caddy reload](https://caddyserver.com/docs/command-line#caddy-reload). TLS debe estar válido antes de entregar acceso; staging obliga cookies Secure y origen HTTPS. Un DNS correcto por sí solo no demuestra un despliegue exitoso.

Una conexión de red añadida a un contenedor existente puede perderse si su propietario lo recrea. El operador debe documentar y comprobar esa conexión después de cualquier recreación del proxy; no editar por su cuenta el Compose de otro proyecto.

## Comprobación y reversión

Verificar health checks, login/logout, denegación anónima de API y pantallas, etiqueta de pruebas y una operación DEMO. Comparar identificadores, tiempos de inicio y salud de los contenedores ajenos antes y después; no corregir problemas preexistentes de otras apps durante este despliegue.

Para revertir la aplicación se vuelve al release anterior y sus etiquetas, conservando el volumen y secretos. Una migración incompatible requiere restauración del respaldo validado, en una ventana explícita; no ejecutar migraciones inversas improvisadas ni borrar el volumen. Para retirar la vista previa, detener solo los servicios `web` y `api` del proyecto; retirar únicamente el host nuevo del proxy y su enlace de red con autorización. No usar `docker system prune`, paradas globales ni `down -v`.

Los scripts `staging-backup.sh` y `staging-restore-check.sh` respaldan esta base y ensayan la restauración en recursos temporales propios. Los respaldos contienen credenciales con hash y datos: mantenerlos privados, fuera de Git y con copia segura fuera del servidor antes de utilizar información comercial real.
