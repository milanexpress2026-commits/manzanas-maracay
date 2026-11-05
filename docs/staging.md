# Staging de Manzanas Maracay

URL: [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net). **Fase 3 completa activa como `phase3-ef3d64616313`**, construida desde **`ef3d64616313b3a5f2184f37365dc751da07af29`**, saludable el `2026-11-05T00:39:12.487397+00:00`. Web, API y esquema comerciales están desplegados y verificados. Este entorno es de pruebas, nunca producción. Un HEAD posterior de documentación no cambia el commit de esta release.

## Acceso público e interno

La entrada `/` y `/demo` muestran ejemplos sintéticos sin contraseña. No consultan la base privada, no crean sesiones operativas y no guardan movimientos. [El acceso interno](https://manzanas.ganamosclub.net/login), catálogo operativo, inventario, recepción, ventas y cobranza requieren sesión de servidor. Las APIs privadas rechazan lecturas y escrituras anónimas.

Cada socio que necesite operar debe tener su propia invitación. Seguir [autenticación](authentication.md); no compartir contraseñas en Git/chat ni crear registro público. La demo no requiere invitaciones.

## Evidencia de la release completa

El [informe final](verificacion-staging-fase3.json) registra la actualización de seis a once migraciones con hashes, historial físico y auditoría previa preservados. Se controlaron catorce tablas preexistentes, con un único evento de catálogo esperado. No quedaron costos disponibles desconocidos, costos positivos en recipientes vacíos, errores de proyección ni constraints sin validar antes del arranque.

El smoke HTTPS aprobó cuatro casos con una fixture propia DEMO: recepción de una caja a USD 25, venta a crédito de USD 40 y abono de USD 10, reintentos con los mismos identificadores y PDF de venta/abono con el logo incorporado desde Docker. Se reversó el abono y anuló la venta mediante eventos auditados: queda una caja DEMO con costo USD 25 y deuda cero. Se conservan documentos e historial. Sin teléfono de cliente, datos reales, mensajes WhatsApp ni suscripciones push. Ocho accesos anónimos fueron denegados y el logout revocó la sesión.

El [navegador externo fresco](verificacion-fase3-browser.json), a las `2026-11-05T00:41:20.141Z`, aprobó siete rutas públicas 200, cuatro denegaciones privadas 401, login interno, cookie Secure y logout revocador. Cinco rondas GET antes (`00:33:02 UTC`) y después (`00:41:29 UTC`) mantuvieron Manzanas 200, Socios 302 y Pedal 200. La auditoría final de las `00:55:37 UTC` conservó los diez contenedores ajenos y PostgreSQL propio sin recreación/reinicio; uno de los ajenos ya se reiniciaba y no se declara saludable. No se modificaron DNS, proxy ni firewall compartidos.

El respaldo previo a migrar se restauró en aislamiento con escritores detenidos. El respaldo posterior al smoke aprobó restauración aislada y limpieza de sus recursos temporales el `2026-11-05T00:50:48.056847+00:00`, SHA-256 `348febeaa23867d6b1a5b440fd19fc2aa872b61c57d224220a5341b93e25aecf`. La copia segura fuera del VPS permanece pendiente.

La [revisión visual](visual-review-fase-3.md) registra 30 vistas, 30 auditorías axe, vídeo de 17,56 s y cuatro muestras de rendimiento local emulado, además de capturas externas de la release. No sustituye tablet física.

El [PR #2 en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2) sigue dirigido a `phase-2/inventario-staging`, sin merge. Como antecedente, la demo temporal `demo-db16c5745423` se publicó el 4 de noviembre a las 23:33:21 UTC desde `db16c574542347cc15c89498184873b9e5953d84`, con cambio solo web y API/base de fase 2 conservadas. Su [informe externo](verificacion-demo-publica.json) es histórico; esa release ya quedó sustituida por la completa.

## Recursos exclusivos

- Directorio `/opt/manzanas-maracay/staging`, proyecto Compose `manzanas-maracay-staging`.
- Base `manzanas_maracay_staging`, propietario `mm_owner`, aplicación `mm_app` sin superusuario.
- Volumen `manzanas-maracay-staging_mm_staging_pg`; redes propias `database`, `application`, `edge`.
- Servicio y alias **`mm-staging-web`**, nunca `web`. API y PostgreSQL sin puertos públicos; diagnóstico web solo `127.0.0.1:33100`.
- PostgreSQL/API 512 MiB y web 384 MiB, una CPU por servicio, health checks y reinicios limitados. Aplicación sin privilegios, archivos de solo lectura y temporales acotados.
- Overlay opcional `compose.push.staging.yaml`: red de salida `push_egress` exclusiva para API, sin puertos ni conexión al proxy. Exige Compose compatible con `gw_priority`.

El proxy compartido ya resuelve `mm-staging-web` en la red de borde. Actualizar la aplicación NO requiere modificar DNS, Caddy ni conectar otra red al proxy. Cualquier cambio compartido futuro necesita aprobación específica. Se preserva la incidencia de alias de fase 2 en [infraestructura](infrastructure.md); no se afirma que nunca hubo afectación histórica.

## Secretos y avisos

`shared/secrets` privado 0700, fuera de releases/Git. Contraseñas separadas de propietario/aplicación, token interno e invitaciones. La web recibe solo el token; API su contraseña y token. VAPID se monta únicamente en API mediante archivos privados 0400 del UID 1000. No publicar claves, invitaciones, respaldos ni logs privados.

Los tres archivos VAPID privados están configurados para la release activa; su contenido no está en Git ni en esta documentación. API dispone únicamente de su red propia de salida push. El smoke confirmó cero dispositivos activos; no se crearon suscripciones ni se enviaron avisos. Push utiliza opt-in de una sola tablet Android corporativa. Configurar VAPID no suscribe dispositivos ni autoriza mensajes a clientes. Falta probar opt-in, recepción real en la tablet y qué aplicación/perfil abre WhatsApp. No afirmar entrega física a partir de mocks. Ver [push](push-cobranza.md).

BCV se informa no disponible mientras no haya fuente oficial verificable y vigente. No cargar una tasa DEMO en staging. USD continúa; VES se bloquea de forma explícita.

## Procedimiento para futuras actualizaciones completas

1. Compilar un commit exacto, revisado y publicado. Cada release tiene su archivo de entorno no secreto y etiquetas propias; nunca sobrescribir imágenes previas.
2. Registrar identidad, imagen, inicio, salud, redes y puertos propios/ajenos; hash y rutas del proxy; cinco GET de Socios y Pedal antes y después.
3. Validar Compose y construir con prioridad baja y paralelismo 1, sin detener servicios previos.
4. Detener únicamente API y web propios durante el cambio del esquema: la API antigua no debe escribir en el nuevo libro de costos.
5. Crear respaldo definitivo sin escritores y probar restauración aislada. Confirmar checksum y conservar imagen/esquema anteriores.
6. Aplicar migraciones nuevas con herramientas propias. Comparar hashes previos, conteos comerciales, historial físico/auditoría y costo reconstruido. Los cambios de catálogo esperados se registran aparte.
7. Arrancar solo API/web con `--no-deps`, conservar PostgreSQL, alias y redes; comprobar release, salud, acceso anónimo/demo, acceso interno y denegaciones.
8. Guardar reporte sin secretos. Mostrar la versión en pantalla; no equiparar un HTTP 200 con éxito de migración o integridad.

Los scripts públicos `staging-backup.sh` y `staging-restore-check.sh` verifican propiedad, rutas y etiquetas de recursos temporales. El ensayo usa un contenedor sin red y volumen temporal exclusivo, retirados al finalizar. En esquemas de fase 3 verifica además costo/proyección, ventas/asignaciones, abonos y saldos, en modo de solo lectura.

## Reversión

Una publicación **solo web**, sin migración, puede revertirse a la imagen web anterior con manifiesto compatible y `--no-deps`, comprobando API/base y otros hosts intactos.

Después de migrar a fase 3, NO ejecutar escritores de fase 2 sobre el nuevo esquema. Ante fallo, detener solo API/web propios, conservar la base y el respaldo validado, evaluar corrección hacia delante. Si se decide restaurar, preparar un plan concreto únicamente para esta base desde el respaldo de la ventana sin escritores y verificarlo antes de arrancar las imágenes compatibles. No improvisar migraciones inversas, borrar volúmenes ni restaurar todo el proxy.

Prohibidos `docker system prune`, `down -v`, paradas globales y cambios de proyectos ajenos. Una nueva conexión o recreación del proxy corresponde a su propietario.

## Límites

Las restauraciones de fase 2 y de la release completa actual fueron verificadas; sus informes se conservan por separado. La restauración posterior de fase 3 incluyó los documentos anulados/reversados y sus costos. Cada nuevo despliegue completo exige su propio respaldo/ensayo. Sigue pendiente una copia segura fuera del VPS; los dumps contienen datos y hashes privados. Antes de producción también faltan validación fiscal y pruebas en dispositivos reales. Los PDF son comprobantes comerciales, no facturas fiscales SENIAT.
