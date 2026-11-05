# Despliegue de producción separada

## Estado y alcance

**Producción publicada y activa para operación interna en USD:** phase4-2a81817fe2c1, código 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0. Activación autorizada a las 12:04:09.980676 UTC del 5 de noviembre de 2026, autenticación pública HTTPS a las 12:04:59 UTC y mantenimiento instalado a las 12:05:58 UTC. [Acceso privado](https://manzanas.ganamosclub.net/login); /demo devuelve HTTP 404 y staging permanece interno en loopback 33100. VES sigue bloqueado y los PDF son comerciales no fiscales. Los commits documentales posteriores no cambian el código desplegado. [Evidencia](verificacion-produccion-fase4.json).

Staging conserva su base e historia sintética. No se copian productos, clientes, cajas, ventas, pagos ni deudas de ejemplo a producción; tampoco se cambian sus indicadores DEMO a reales. Las pruebas de operaciones se realizan en una base aislada expresamente identificada para QA. Una base con datos sintéticos no se promueve después a la del negocio.

## Identidad de los recursos

| Recurso                       | Producción preparada                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Proyecto Compose              | `manzanas-maracay-production`                                                                           |
| Directorio de releases        | `/opt/manzanas-maracay/production/releases/phase4-<SHA12>`                                              |
| Release activa                | Enlace `current` a la release exacta; commit completo verificado                                        |
| Directorio privado compartido | `/opt/manzanas-maracay/production/shared`                                                               |
| PostgreSQL                    | Base nueva `manzanas_maracay_production`, PostgreSQL 18 fijado por digest                               |
| Volumen                       | `manzanas-maracay-production_mm_production_pg`                                                          |
| Roles                         | `mm_prod_bootstrap` para administración local; `mm_prod_owner` para migraciones; `mm_prod_app` para API |
| Redes propias                 | `database` y `application` internas; `edge` exclusiva para entrada web                                  |
| Entrada web local             | `127.0.0.1:33101` hacia el puerto 3100 del servicio `mm-production-web`                                 |
| Alias de proxy                | `mm-production-web`, exclusivo; nunca el alias genérico `web`                                           |
| API y base                    | Sin puertos publicados en el host                                                                       |
| Entorno                       | `MM_APP_ENV=production`, validado en servidor y vinculado a la base                                     |

[compose.production.yaml](../compose.production.yaml), [Dockerfile.production](../infra/Dockerfile.production), [init-production-roles.sh](../infra/init-production-roles.sh) y [production-runtime.mjs](../scripts/production-runtime.mjs) son la configuración de referencia. No sustituirlos por el Compose de staging.

Las imágenes de Node y PostgreSQL se fijan por digest. El build recibe solo origen, release y commit públicos. API y web usan usuario sin privilegios, sistema de archivos de solo lectura, límites de recursos y logs acotados. Los servicios persistentes reinician con `unless-stopped`; las herramientas de migración e invitación no se reinician automáticamente. Un reinicio no salta la activación ni convierte una base QA en producción.

## Procedimiento de preparación aplicado antes de exponer tráfico

1. Verificar rama y SHA exactos, typecheck, pruebas, build y migraciones nuevas/upgrade. Conservar las evidencias de esta fase; los resultados históricos de fase 3 no la validan. La inicialización confirmó contenedores preexistentes conservados y proxy público intacto. Repetir la comparación de staging y terceros antes/después del futuro cambio de tráfico.
2. Tomar inventario de los contenedores, redes, puertos, proxy y rutas HTTP reales de las demás aplicaciones. Preparar un cambio mínimo y reversión concreta. No detener ni reiniciar otros proyectos, ejecutar limpieza global de Docker o reutilizar nombres ambiguos.
3. Crear directorios privados y secretos **nuevos** de producción. `shared/deploy.env` contiene únicamente las variables permitidas de identidad, imágenes y rutas; se protege como `root:0600`. No incluir contraseñas, tokens, acceso del negocio o VAPID en Git, argumentos de shell ni logs.
4. Preparar archivos montados de bootstrap, owner, aplicación, token interno e invitación. El runtime exige archivos regulares sin enlaces, ruta exacta, permisos `0400` y propietario `1000:1000` para los secretos de la aplicación. En la imagen PostgreSQL fijada, `bootstrap_password`, `owner_password_init` y `app_password_init` usan `70:70`, modo `0400`; no intercambiar esas copias con las de runtime. Mantener el directorio de control `root:1000`, modo `0750`, montado de solo lectura en la API.
5. Construir las imágenes de la release exacta, iniciar solamente PostgreSQL propio y comprobar que la base es nueva. Crear el respaldo anterior a migración, aplicar las migraciones con el owner limitado y comprobar el vínculo inmutable de entorno/roles/UUID. No ejecutar seed en producción: el iniciador no ofrece ese comando.
6. Comprobar cero registros comerciales e invitar el único acceso compartido de los propietarios desde el archivo privado. El usuario y la contraseña elegidos se manejan fuera del repositorio. La opción administrativa `invite --reset` renueva ese acceso y revoca sus sesiones; no crear cuentas individuales para cada teléfono.
7. Iniciar API y web propias con la activación ausente. La salud puede estar disponible y `ready=false`: permite login y lectura, mientras las mutaciones comerciales permanecen bloqueadas. Confirmar `/demo` y todo su árbol con HTTP 404, incluso peticiones RSC; datos privados y API requieren sesión. No crear proveedores ni ventas ficticias en la nueva base real para probarla.
8. Generar respaldo posterior a migraciones, comprobar restauración completa con ACL y realizar la vuelta de cifrado/descifrado/restauración de la copia externa según [backup-produccion.md](backup-produccion.md). Verificar por separado acceso, cuenta compartida, aislamiento e infraestructura.

El ensayo HTTPS local usa una base QA exclusiva y el origen `https://localhost:3143`; sus certificados de prueba y datos sintéticos no se trasladan al VPS. La producción usa únicamente el origen HTTPS exacto previsto, cookies `__Host-` con `Secure`, `HttpOnly` y `SameSite=Strict`, comprobación de origen y revocación de sesiones. «Mantener sesión activa» conserva el acceso hasta 30 días; desmarcado mantiene el límite de 8 horas y 30 minutos de inactividad. No guarda la contraseña en almacenamiento web.

## Activación y cambio de URL

El cambio concreto ya fue autorizado y ejecutado: solo el upstream de Manzanas pasó a mm-production-web:3100. Se verificaron rutas previas y aplicaciones compartidas; el proxy no se reinició. El primer intento abortó antes de configuración/gate por la medición de rutas de BusyBox, deshizo la conexión propia y se repitió con la lectura corregida. Los controles siguientes siguen siendo aplicables a futuros cambios; no representan una aprobación pendiente del cambio completado.

La API vuelve a comprobar el archivo privado `activation.json` antes de mutar. Debe coincidir con commit, release, base, UUID y origen; incluye referencia de aprobación, fechas y evidencia verdadera de respaldo externo, restauración, autenticación, cuenta, separación de datos, infraestructura y alcance comercial no fiscal. **No completar esas evidencias con `true` para sortear controles pendientes.** Una activación válida no caduca a mitad de la operación diaria, pero una nueva release necesita su identidad y evidencia correspondientes.

La autorización general de desarrollo no sustituye la autorización concreta para DNS, Caddy o redes compartidas. Antes de pedir ese cambio, dejar preparados el host exacto, destino `mm-production-web:3100`, red exclusiva, respaldo del proxy, validación de su configuración y reversión. El proxy no está conectado automáticamente por Compose. Verificar la estrategia para conservar QA accesible de forma interna sin dejar la demo como entrada principal del negocio; no inventar un subdominio ni cambiar DNS para ello sin acuerdo.

Solo después de cerrar los controles críticos y obtener la aprobación del cambio concreto, conectar el proxy a la red exclusiva necesaria, cambiar el upstream de ese host y recargar la configuración validada. No reiniciar los demás contenedores. Verificar inmediatamente URL HTTPS, identidad de release, login, datos vacíos, denegaciones anónimas, sesión persistente/cierre y las mismas rutas reales de terceros observadas antes. El resultado esperado de producción es inicio privado o login, sin banner de pruebas ni tarjetas con datos ficticios.

La apertura comercial no acredita funcionalidades externas todavía pendientes: VES sigue bloqueado si falta una tasa BCV oficial vigente; los PDF son comprobantes comerciales no fiscales. El opt-in push y WhatsApp requieren validación en la tablet física. [compose.push.production.yaml](../compose.push.production.yaml) es opcional y utiliza claves VAPID nuevas, una red de salida propia y suscripción explícita; no reutiliza las claves o dispositivos de staging.

## Verificación y mantenimiento

[production-health.mjs](../scripts/production-health.mjs) comprueba liveness, entorno y release; `--require-ready` exige además activación. Un contenedor saludable no es prueba suficiente de apertura comercial. El mantenimiento propio ya está instalado y verificado. Para una futura reinstalación, revisar [production-maintenance.cron.example](../infra/production-maintenance.cron.example): monitor y respaldo/restauración tienen logs privados y no envían mensajes externos ni realizan la copia cifrada fuera del VPS.

Registrar por separado: implementado en código, probado localmente, comprobado en staging, desplegado en producción, accesible por propietarios y pendiente externo. No usar capturas o pruebas de otra fase para completar una categoría faltante. Conservar la comparación de imágenes, configuración y salud de staging y demás aplicaciones antes/después del despliegue.

## Reversión

Si falla la verificación previa, mantener el tráfico en su destino anterior y la producción sin activar. Si falla después del cambio, cerrar mutaciones y restaurar únicamente el upstream/configuración específica del host, mediante la recarga validada y autorizada. Conservar los volúmenes, datos, registros y release fallida para investigar.

Revertir la imagen no revierte una migración ni elimina las operaciones ya registradas. Antes de volver a código anterior, comprobar compatibilidad del esquema; si se necesita recuperar datos, usar un respaldo ensayado en una instancia nueva y conciliar las operaciones posteriores. No borrar la base nueva ni importar staging como alternativa. La recuperación y la nueva apertura requieren sus propias verificaciones y aprobación concreta del cambio de tráfico.
