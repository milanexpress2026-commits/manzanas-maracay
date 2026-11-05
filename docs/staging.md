# Staging de Manzanas Maracay

URL: [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net). Demo sin contraseña activa como **`demo-db16c5745423`**, saludable a las 23:33:21 UTC del 4 de noviembre de 2026. Esta publicación es solo web; API, PostgreSQL y esquema conservan Fase 2 (`phase2-7ae1d75`). El código comercial de Fase 3 está verificado/publicado, pero su despliegue completo sigue pendiente. Entorno de pruebas, nunca producción.

## Acceso público e interno

La nueva entrada `/` y `/demo` muestran ejemplos sintéticos sin contraseña. No consultan la base privada, no crean sesiones operativas y no guardan movimientos. `/login` conserva acceso privado; catálogo operativo en `/catalogo`, inventario, recepción, ventas y cobranza requieren sesión de servidor. Las APIs privadas rechazan lecturas y escrituras anónimas. La publicación intermedia web deja API y base de fase 2 intactas; los módulos comerciales internos solo se habilitan con el despliegue completo verificado.

Cada socio que necesite operar debe tener su propia invitación. Seguir [autenticación](authentication.md); no compartir contraseñas en Git/chat ni crear registro público. La demo no requiere invitaciones.

## Evidencia de la publicación web temporal

Web construida desde `db16c574542347cc15c89498184873b9e5953d84`, rama `phase-3/demo-publica-temporal`. Se conservaron API, PostgreSQL, esquema, proxy y rutas existentes; cinco rondas GET mantuvieron Socios 302 y Pedal 200. No se aplicaron migraciones comerciales ni se habilitaron sus endpoints por esta publicación.

A las 23:42:14 UTC un navegador externo fresco recorrió siete rutas públicas con 200, sin llamar APIs privadas ni crear cookie operativa. Cuatro solicitudes privadas GET/POST/PATCH recibieron 401; login, cookie Secure y logout revocador aprobaron. El [informe externo](verificacion-demo-publica.json) identifica rutas y resultados. La [revisión visual](visual-review-fase-3.md) agrega 30 vistas, 30 auditorías axe, vídeo de 17,56 s y cuatro muestras de rendimiento local emulado.

Código comercial principal publicado: `28110ef0f0bf1079ffa60b3f60545c2bfd194290`, [PR #2 en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2) hacia `phase-2/inventario-staging`. Sin merge; no confundirlo con la imagen web temporal activa.

## Recursos exclusivos

- Directorio `/opt/manzanas-maracay/staging`, proyecto Compose `manzanas-maracay-staging`.
- Base `manzanas_maracay_staging`, propietario `mm_owner`, aplicación `mm_app` sin superusuario.
- Volumen `manzanas-maracay-staging_mm_staging_pg`; redes propias `database`, `application`, `edge`.
- Servicio y alias **`mm-staging-web`**, nunca `web`. API y PostgreSQL sin puertos públicos; diagnóstico web solo `127.0.0.1:33100`.
- PostgreSQL/API 512 MiB y web 384 MiB, una CPU por servicio, health checks y reinicios limitados. Aplicación sin privilegios, archivos de solo lectura y temporales acotados.
- Overlay opcional `compose.push.staging.yaml`: red de salida `push_egress` exclusiva para API, sin puertos ni conexión al proxy. Exige Compose compatible con `gw_priority`.

El proxy compartido ya resuelve `mm-staging-web` en la red de borde. Actualizar la aplicación NO requiere modificar DNS, Caddy ni conectar otra red al proxy. Cualquier cambio compartido futuro necesita aprobación específica. Se preserva la incidencia de alias de fase 2 en [infraestructura](infrastructure.md); no se afirma que nunca hubo afectación histórica.

## Secretos y avisos

`shared/secrets` privado 0700, fuera de releases/Git. Contraseñas separadas de propietario/aplicación, token interno e invitaciones. La web recibe solo el token; API su contraseña y token. VAPID, si se activa, se monta únicamente en API mediante archivos privados 0400 del UID 1000. No publicar claves, invitaciones, respaldos ni logs privados.

Se crearon y validaron tres archivos VAPID privados durante esta preparación, sin arrancar servicios, crear suscripciones ni enviar avisos. Su contenido no está en Git ni en esta documentación. Push utiliza opt-in de una sola tablet Android corporativa. Configurar VAPID no suscribe dispositivos ni autoriza mensajes a clientes. Verificar cero dispositivos activos antes del primer arranque del dispatcher. Probar luego recepción real en la tablet y qué aplicación/perfil abre WhatsApp. No afirmar entrega física a partir de mocks. Ver [push](push-cobranza.md).

BCV se informa no disponible mientras no haya fuente oficial verificable y vigente. No cargar una tasa DEMO en staging. USD continúa; VES se bloquea de forma explícita.

## Actualización completa

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

La restauración de fase 2 fue verificada y su evidencia histórica se conserva. Cada nuevo despliegue completo exige su propio respaldo/ensayo. Sigue pendiente una copia segura fuera del VPS; los dumps contienen datos y hashes privados. Antes de producción también faltan validación fiscal y pruebas en dispositivos reales. Los PDF son comprobantes comerciales, no facturas fiscales SENIAT.
