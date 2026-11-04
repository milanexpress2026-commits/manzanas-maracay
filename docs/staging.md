# Vista previa de Manzanas Maracay

Staging activo: [https://manzanas.ganamosclub.net](https://manzanas.ganamosclub.net), con HTTPS y sesión invitada. Esta guía describe únicamente el entorno de pruebas. Release verificada: `phase2-7ae1d75`, commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef`. La integración final y el smoke externo se aprobaron tras corregir la colisión de alias Docker documentada en la [entrega de fase 2](entrega-fase-2.md).

## Recursos exclusivos

- Directorio del servidor: `/opt/manzanas-maracay/staging`.
- Proyecto Compose: `manzanas-maracay-staging`.
- Base: `manzanas_maracay_staging`; propietario de migraciones `mm_owner` y aplicación `mm_app` sin superusuario.
- Volumen `manzanas-maracay-staging_mm_staging_pg` y redes `database`, `application`, `edge` propias del proyecto.
- PostgreSQL y API sin puertos publicados. El servicio web tiene el nombre exclusivo `mm-staging-web`, accesible por Caddy en la red de borde y por diagnóstico en `127.0.0.1:33100` del servidor.
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
docker compose --env-file ../../shared/staging.env -p manzanas-maracay-staging -f compose.staging.yaml up -d --wait api mm-staging-web
```

Antes de actualizar: ejecutar typecheck, unitarios, build y E2E; respaldar la base propia y registrar imágenes previas. Inspeccionar el diff para excluir secretos. La compilación utiliza Node 24 y PostgreSQL 18.6; el volumen de PostgreSQL 18 se monta en `/var/lib/postgresql` según la [imagen oficial](https://hub.docker.com/_/postgres).

## HTTPS y proxy compartido

`infra/caddy-staging.snippet` contiene solamente el host nuevo. Se debe agregar al archivo existente, conservando su contenido anterior, después de comprobar su hash, guardar respaldo privado y validar la configuración completa. El proxy necesita acceso a la red `manzanas-maracay-staging_edge` para resolver `mm-staging-web`; no necesita las redes internas de la API o de la base.

La adición del registro A de `manzanas` al VPS, la conexión del proxy a esa red y la recarga de Caddy recibieron aprobación específica y se ejecutaron. El registro usa modo DNS only; HTTPS y redirección desde HTTP se verifican por la URL real. Los futuros cambios de infraestructura compartida requieren una autorización acorde con su alcance. No reemplazar configuraciones ni reiniciar servicios ajenos. Una recarga validada usa el mecanismo de [Caddy reload](https://caddyserver.com/docs/command-line#caddy-reload). Staging obliga cookies Secure y origen HTTPS. Un DNS correcto por sí solo no demuestra un despliegue exitoso.

El nombre del servicio Compose también se anuncia como alias DNS en sus redes. Por eso el servicio se llama `mm-staging-web`, no `web`: conectar el proxy a una red que ofrece otro alias genérico `web` puede desviar solicitudes de aplicaciones ya existentes. Antes de conectar la red, verificar nombres y alias; después, realizar solicitudes GET a cada host afectado además de comprobar la salud de contenedores. La incidencia detectada y su resolución se registran en [infrastructure.md](infrastructure.md).

Una conexión de red añadida a un contenedor existente puede perderse si su propietario lo recrea. El operador debe documentar y comprobar esa conexión después de cualquier recreación del proxy; no editar por su cuenta el Compose de otro proyecto.

Al conectar la red de borde propia al proxy, usar una prioridad de gateway inferior (`docker network connect --gw-priority -1 ...`) para preservar su ruta de salida existente. Registrar y comparar la ruta antes y después; no asumir que añadir una red deja intacta la selección de gateway. Este control acompaña la comprobación de alias exclusivos y de GET por host.

## Comprobación y reversión

Verificar health checks, login/logout, denegación anónima de API y pantallas, etiqueta de pruebas y una operación DEMO. Comparar identificadores, tiempos de inicio y salud de los contenedores ajenos antes y después; no corregir problemas preexistentes de otras apps durante este despliegue.

Para revertir la aplicación, seleccionar las etiquetas de imágenes anteriores compatibles y conservar **el manifiesto corregido con servicio `mm-staging-web`**, el volumen y los secretos. Nunca reutilizar el Compose antiguo con servicio `web`: reintroduciría el alias que colisionó con Socios. Una migración incompatible requiere restauración del respaldo validado, en una ventana explícita; no ejecutar migraciones inversas improvisadas ni borrar el volumen.

Para retirar la vista previa, detener solo los servicios `mm-staging-web` y `api` del proyecto y desconectar su red de borde. Retirar únicamente el bloque nuevo de Manzanas del proxy con autorización, revisar el diff y validar antes de recargar. La copia previa es una referencia de recuperación, no un archivo para reemplazar ciegamente toda la configuración: otras rutas podrían haber cambiado después. No usar `docker system prune`, paradas globales ni `down -v`.

Los scripts `staging-backup.sh` y `staging-restore-check.sh` respaldan esta base y ensayan la restauración en recursos temporales propios. Los respaldos contienen credenciales con hash y datos: mantenerlos privados, fuera de Git y con copia segura fuera del servidor antes de utilizar información comercial real.

El 4 de noviembre de 2026 se restauró correctamente el respaldo de las 20:47 UTC en un contenedor sin red y volumen propios, verificando tablas, migraciones, usuarios e inventario y retirando después ambos recursos temporales. La copia fuera del VPS y la revisión del propietario son pasos previos al uso de datos reales, no impedimentos para la demostración invitada.
