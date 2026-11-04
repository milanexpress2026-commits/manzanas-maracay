# Autenticación de la fase 2

Todas las pantallas de negocio y sus API requieren una sesión de una persona invitada. Esto se aplica también a desarrollo y pruebas. El único endpoint público es `GET /api/health`: devuelve el estado del servicio sin catálogo, usuarios ni detalles de conexión.

## Flujo y contrato

El navegador habla con el proxy del mismo origen de Next.js. El proxy añade un token interno, y NestJS verifica por separado ese token y la sesión. Enviar un token interno desde el navegador no crea una sesión ni permite omitirla. La API de staging no publica un puerto al exterior.

| Endpoint                | Solicitud                                    | Resultado                                                                 |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /api/auth/login`  | JSON `{ username, password }`, origen válido | Cookie de sesión y `{ user: { id, username, displayName }, environment }` |
| `GET /api/auth/me`      | Cookie válida                                | La misma información pública de sesión                                    |
| `POST /api/auth/logout` | JSON `{}`, origen válido                     | Revoca la sesión en PostgreSQL, borra la cookie y devuelve `{ ok: true }` |

`environment` es `local`, `test` o `staging`. La interfaz de staging muestra **ENTORNO DE PRUEBAS**. Las páginas del servidor llaman a `requireSession()` antes de renderizar datos; las mutaciones usan `request.user.id` como actor de auditoría, sin aceptar una identidad del cliente.

## Protección de credenciales y sesiones

Las contraseñas tienen entre 14 y 256 caracteres. Se guardan mediante scrypt con sal aleatoria de 16 bytes, `N=131072, r=8, p=1` y salida de 64 bytes. La API limita a una derivación simultánea para acotar memoria; el perfil sigue la [recomendación de OWASP para scrypt](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Cada sesión usa 32 bytes aleatorios. PostgreSQL conserva solamente su SHA-256. La sesión caduca a las 8 horas y tras 30 minutos de inactividad. Cerrar sesión o restablecer la contraseña revoca el acceso en el servidor. El inicio de sesión y el restablecimiento comparten un bloqueo transaccional por usuario para evitar que una contraseña anterior genere una sesión durante un cambio de contraseña.

En staging la cookie se llama `__Host-mm_session`, con `Secure; HttpOnly; SameSite=Strict; Path=/`, sin atributo Domain. Local/test usan `mm_session` sobre loopback. Los atributos siguen la [guía de sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Nunca se guarda el token en localStorage.

El límite persistido es de 8 intentos por usuario normalizado cada 15 minutos, más 120 intentos globales por minuto. Los intentos contra usuarios inexistentes ejecutan la misma verificación costosa y dan el mismo mensaje de error. Un acceso correcto reinicia el contador de ese usuario. El límite global y el trabajo simultáneo acotado pueden producir un 429 durante una ráfaga legítima; se debe esperar antes de volver a intentar.

Las mutaciones requieren el origen configurado y JSON. El proxy rechaza solicitudes de otro sitio, limita el cuerpo a 64 KiB y solo permite rutas declaradas. NestJS comprueba el origen nuevamente y aplica el mismo límite de cuerpo. No se confía en cabeceras de IP o identidad proporcionadas por un visitante. Las respuestas de autenticación y del proxy usan `Cache-Control: no-store`.

## Configuración

| Variable                 | Uso                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `MM_APP_ENV`             | `local`, `test` o `staging`; no existe modo sin autenticación                             |
| `MM_APP_ORIGIN`          | Origen exacto, sin ruta. Staging requiere HTTPS y un dominio ajeno a loopback             |
| `MM_API_BASE_URL`        | Dirección privada de NestJS, consultada exclusivamente por el servidor Next.js            |
| `MM_INTERNAL_TOKEN`      | Secreto entre servidores, nunca una contraseña de usuario ni una variable `NEXT_PUBLIC_*` |
| `MM_INTERNAL_TOKEN_FILE` | En staging, archivo Docker secret del token interno                                       |
| `MM_API_HOST`            | Loopback local; `0.0.0.0` dentro de la red aislada del contenedor de staging              |
| `MM_PRIVATE_DIR`         | Directorio autorizado para el archivo privado de invitación                               |

`.env.example` solo contiene ejemplos. Los valores reales permanecen en archivos privados fuera de Git. El iniciador de staging lee los secretos de `/run/secrets/`; API usa el rol limitado `mm_app`, y las herramientas administrativas usan `mm_owner`. La aplicación solo puede leer `app_users`: no puede crear usuarios ni cambiar sus contraseñas.

## Invitar o restablecer un usuario

No hay registro público ni formulario administrativo de contraseñas en esta fase. El propietario prepara un JSON privado con `username`, `displayName` y `password`. El usuario admite 3–80 caracteres: letras minúsculas, números y `._@+-`; los espacios externos se normalizan. Elegir una contraseña aleatoria larga mediante un gestor de contraseñas.

El archivo debe estar dentro de `MM_PRIVATE_DIR` (por defecto `.local`), ocupar como máximo 16 KiB y tener permisos 0600 o 0400 en Linux. El programa resuelve enlaces simbólicos y comprueba la ubicación real. No colocar contraseñas en argumentos, historial de shell, capturas, logs, issues o chats.

Con la conexión administrativa exclusiva configurada, la herramienta local es:

```sh
node --import tsx scripts/create-user.ts --file .local/invitacion.json
```

Para restablecer una contraseña existente, preparar un nuevo archivo privado y añadir `--reset`. Sin esa opción, la herramienta rechaza usuarios existentes. El restablecimiento revoca todas las sesiones del usuario. El archivo no se imprime; su entrega debe hacerse por un canal privado y debe retirarse cuando deje de ser necesario.

En staging, el servicio de herramientas monta el secreto `invitation` y lo expone a `/run/secrets/invitation`:

```sh
docker compose --project-name manzanas-maracay-staging -f compose.staging.yaml --profile tools run --rm migrate invite
```

El comando necesita las variables privadas de despliegue ya configuradas. El contenedor de herramientas corre como UID 1000: el archivo de invitación debe ser legible por ese UID y conservar permisos privados. Docker Compose con secretos basados en archivos puede preservar los permisos del archivo anfitrión; comprobarlos sin mostrar el contenido.

Para un restablecimiento administrativo en staging, ejecutar la misma herramienta dentro del contenedor con `--reset` mediante un procedimiento explícito del responsable de despliegue. El modo `invite` del iniciador no restablece automáticamente cuentas existentes.

## Desarrollo, pruebas y recuperación

`npm run dev` crea el acceso local solo si falta, con contraseña aleatoria en `.local/auth-local.json`. El iniciador de pruebas usa otro usuario y `.local/auth-test.json` en la base exclusiva de pruebas. Este bootstrap se niega a funcionar en staging. No se incluyen credenciales universales ni contraseñas predeterminadas.

Las pruebas verifican el bloqueo de pantallas/API anónimas, inicio/cierre de sesión, recarga, cookies, origen y formato, límites de intentos, token interno independiente, expiración por inactividad y revocación al cambiar contraseña. Las trazas de Playwright pueden contener secretos de prueba y se mantienen fuera de Git.

Los respaldos de PostgreSQL incluyen hashes de contraseñas, sesiones y datos comerciales. Deben tratarse como privados aunque las contraseñas no estén en texto plano. `scripts/staging-backup.sh` crea un archivo custom externo al repositorio con huella SHA-256 y metadatos; `scripts/staging-restore-check.sh` ensaya su recuperación en un contenedor y volumen nuevos, sin red ni puertos.

```sh
bash scripts/staging-backup.sh /RUTA/PRIVADA/EXTERNA
bash scripts/staging-restore-check.sh /RUTA/PRIVADA/EXTERNA/manzanas-maracay-staging-FECHA-SUFIJO.dump
```

La carpeta debe pertenecer al operador y tener permisos 0700; los archivos, 0600. Ambos scripts se ejecutan en el host Docker Linux. La copia requiere las variables de Compose de staging; el ensayo usa la imagen PostgreSQL exacta registrada en los metadatos, que debe estar disponible localmente. El ensayo no se conecta a la base original. Solo elimina el contenedor y volumen que creó, después de verificar sus nombres y etiquetas de ejecución.

Un retorno cero del ensayo confirma restauración, presencia de tablas/migraciones, restricciones validadas y conciliación del inventario, además de la limpieza de sus recursos temporales. El resultado `.ok` y los logs quedan privados junto al respaldo. No afirmar que la recuperación fue ensayada hasta ejecutar ese procedimiento correctamente; una comprobación de sintaxis no lo sustituye.

El custom dump contiene una sola base y no conserva propietarios, privilegios ni roles del clúster. Una recuperación real requiere recursos nuevos y aislados, los roles/secretos del proyecto, reaplicar los permisos de `scripts/migrate.ts`, revocar sesiones restauradas y volver a verificar la aplicación antes de autorizar el cambio de destino. Estos scripts no cambian el destino activo ni borran el volumen original. Conservar el respaldo y sus metadatos juntos; una copia en el mismo VPS no protege frente a la pérdida de ese VPS. Acordar copia cifrada fuera del host y retención antes de usar datos comerciales reales.

Referencias del procedimiento: [pg_dump de PostgreSQL 18](https://www.postgresql.org/docs/18/app-pgdump.html), [pg_restore de PostgreSQL 18](https://www.postgresql.org/docs/18/app-pgrestore.html). Restaurar únicamente respaldos propios y de confianza, porque una restauración ejecuta objetos SQL del origen.
