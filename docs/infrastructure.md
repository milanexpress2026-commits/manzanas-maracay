# Entorno e infraestructura

Registro del 4 de noviembre de 2026. La inspección inicial de fase 1 y el despliegue aislado de fase 2 se distinguen a continuación. No se copiaron credenciales al repositorio. El acceso SSH utiliza la llave autorizada y comprobación del servidor conocido.

## Computadora local

- Windows 10, compilación 19045, 4 procesadores lógicos disponibles para el entorno.
- Node.js 24.19.0, npm 11.17.0 y Git 2.55.0.
- Docker, CLI de PostgreSQL y GitHub CLI no estaban disponibles en PATH.
- La consulta de memoria y CPU por CIM estuvo restringida al inicio; no se inventaron cifras de RAM local.
- Espacio libre inicial aproximado: 9 GB. Dependencias, Chromium y PostgreSQL se instalaron dentro del proyecto; no se instalaron servicios globales.
- No existía un repositorio en la carpeta inicial. Se creó un repositorio exclusivo en `outputs/manzanas-maracay`, rama `phase-1/foundations`.
- Se inspeccionaron puertos antes de elegir 3100, 3101 y 55432. No se reutilizaron bases existentes.

## Inspección inicial del VPS (fase 1)

Durante la inspección inicial se ejecutaron únicamente lecturas: `/etc/os-release`, `nproc`, `free`, `df`, versiones, `docker ps`, `ss -lnt` y nombres de servicios activos. No se consultaron variables de contenedores, archivos de aplicación, secretos, datos comerciales ni bases de otros proyectos.

| Recurso          | Resultado observado                                       |
| ---------------- | --------------------------------------------------------- |
| Sistema          | Ubuntu 24.04.5 LTS                                        |
| CPU              | 8 CPU lógicas                                             |
| RAM              | 24.031 MiB totales; 22.518 MiB disponibles en esa lectura |
| Disco raíz       | 290 GB; 18 GB usados; 272 GB disponibles                  |
| Docker           | 29.1.3                                                    |
| Docker Compose   | 2.40.3                                                    |
| Contenedores     | 10 existentes                                             |
| Puertos públicos | SSH 22, HTTP 80, HTTPS 443                                |
| Otros listeners  | Resolución local DNS y puerto local 34241                 |

Se observaron servicios de Pedal, Socios, Sent y Auditoría. Los contenedores con comprobación de salud aparecían saludables. El worker `auditoria-hg-private-worker-1` **ya estaba en estado Restarting**; no se inspeccionaron sus logs ni se cambió su estado, porque no pertenece a Manzanas Maracay.

En aquella primera fase no se ejecutó `docker compose up`, reinicios, migraciones remotas, limpieza de Docker, cambios de firewall, DNS, Caddy/Nginx ni certificados. Tampoco se creó una carpeta remota de la aplicación. El avance posterior se documenta en la sección de fase 2.

La capacidad observada permitió preparar un despliegue aislado; no es una prueba de carga máxima ni una garantía de capacidad futura.

## Base local

PostgreSQL 18.6 real, empaquetado por `embedded-postgres` 18.6.0-beta.19, con binarios dentro de `node_modules`. Datos persistentes en `.local/postgres`, puerto 55432 ligado solo a loopback. Usuarios independientes de cualquier VPS: `mm_owner` para preparación y `mm_app` sin privilegios de superusuario, con permisos limitados a los módulos habilitados de catálogo, recepción, inventario, sesiones y trazabilidad.

Durante QA se resolvió un problema de Windows: el cierre del grupo de procesos de Playwright podía dejar un hijo de PostgreSQL abierto. El ejecutor de pruebas ahora posee PostgreSQL fuera del grupo del navegador y lo cierra mediante `pg_ctl` después de verificar el directorio y puerto del archivo PID. Los registros se conservan. La corrección no requirió detener aplicaciones ajenas.

## Staging aislado (fase 2)

Release final desplegada: `phase2-7ae1d75`, commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef`, construida desde el código del commit exacto. Sustituye la publicación inicial `518c5c9` con la corrección del nombre del servicio web. Directorio `/opt/manzanas-maracay/staging`, proyecto Compose `manzanas-maracay-staging`, base `manzanas_maracay_staging`, tres redes y un volumen exclusivos. PostgreSQL, API y `mm-staging-web` están saludables. PostgreSQL y API no publican puertos; la web conserva acceso en el loopback del VPS, puerto 33100, y Caddy la ofrece por HTTPS en [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net).

Se verificó desde el servidor y después desde la URL externa: health 200, API privada anónima 401, pantalla privada con redirección 307, login y consulta autenticada 200, cookie `__Host-mm_session` con `Secure`, `HttpOnly` y `SameSite=Strict`, rechazo de origen ajeno 403 y revocación al cerrar sesión. HTTP redirige a HTTPS con 308; el certificado Let's Encrypt observado es válido hasta el 2 de febrero de 2027. El navegador confirmó acceso del propietario y el inventario DEMO: tres cajas recibidas y retiro de un blíster dejan dos cajas cerradas y cuatro blíster intactos, equivalencia catorce, con piezas desconocidas nulas. [Captura de la aplicación publicada](capturas/staging-escritorio.jpg).

El respaldo custom del 4 de noviembre a las 20:47 UTC se restauró en un contenedor temporal sin red ni puertos, con volumen propio. Se verificaron tablas, historial de migraciones, usuarios, lotes y conciliación de movimientos/saldos; el ensayo y la limpieza exclusiva de sus recursos terminaron correctamente. Respaldo, metadatos y logs quedan privados fuera del repositorio. No hay aún una copia externa al VPS; realizarla antes de incorporar datos comerciales reales.

Se compararon los diez contenedores preexistentes antes y después del despliegue y se repitió la auditoría tras la corrección final. Los nueve estables conservaron identificador, imagen, inicio, estado y salud, sin diferencias; el worker que ya se reiniciaba permaneció sin intervención. Esos datos no prueban por sí solos ausencia de impacto HTTP: durante la integración se detectó la incidencia de alias descrita a continuación. No se ejecutaron paradas, reinicios, limpiezas ni migraciones sobre proyectos ajenos.

### Incidencia de alias durante la integración del proxy

Al conectar Caddy a la nueva red, Compose anunciaba el servicio de Manzanas también bajo el alias genérico `web`. Ese nombre colisionó con el backend `web:8000` de Socios y produjo una respuesta HEAD 502. Se desconectó únicamente la red de borde de Manzanas del proxy: Socios recuperó su respuesta y después se verificó GET 302; Pedal devolvió GET 200. El 405 obtenido antes con HEAD indicaba método no admitido y no se utilizó como sustituto de la prueba GET. No se reinició ni modificó la aplicación ajena. Staging quedó temporalmente desconectado para completar la corrección.

El commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef` cambia únicamente el nombre del servicio de este proyecto a `mm-staging-web`, eliminando el alias genérico. Se construyó y desplegó la release corregida, retirando solo el antiguo contenedor web propio. El proxy se reconectó con `--gw-priority -1`; se verificaron conservadas la ruta por defecto y todas las rutas previas.

A las 21:08:33 UTC se confirmó el cierre: cinco rondas GET consecutivas devolvieron Manzanas `/api/health` 200, Socios raíz 302 y Pedal raíz 200. Se repitió completo el smoke HTTPS de sesión en la release corregida, con todos sus controles aprobados, y el navegador volvió a mostrar el inventario DEMO de dos cajas y cuatro blíster. La auditoría final de los diez contenedores ajenos mantuvo sin diferencias los nueve estables. La incidencia quedó resuelta; no se afirma ausencia absoluta de afectación durante el despliegue.

Los resultados HTTP y de sesión se conservan en [verificacion-staging.json](verificacion-staging.json), sin secretos, incluidas las cinco rondas GET posteriores a la corrección.

El propietario confirmó `manzanas.ganamosclub.net` y aprobó específicamente los cambios de DNS y proxy. Cloudflare administra el DNS y el registro del dominio; se creó el nuevo registro A `manzanas` en modo DNS only. No se identificó un hosting compartido separado que deba ejecutar Node o PostgreSQL. La aplicación y su única base de preview residen en el VPS. Se guardó copia privada del proxy, se añadió solamente ese host, se validó la configuración en aislamiento y se aplicó una recarga de Caddy sin reiniciarlo. El proxy se conectó a la red de borde propia de la web. Para validar se consultaron exclusivamente el archivo del proxy, sus rutas/redes y la variable de dominio público referenciada, sin leer secretos ni bases de otras apps.

La [guía de staging](staging.md) documenta secretos, límites, actualización, backup y rollback. La [entrega de fase 2](entrega-fase-2.md) registra el estado final de publicación.

## GitHub

Repositorio público autorizado por el propietario: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). La rama de trabajo es `phase-2/inventario-staging`, basada en `phase-1/foundations`. El cambio de visibilidad del código no da acceso a la aplicación ni modifica el VPS.

El [PR #1 está en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1), dirigido a `phase-1/foundations`. No se realizó merge ni despliegue de producción. Las credenciales, llaves, bases locales, respaldos y dependencias quedan fuera del código versionado. El informe de entrega enlaza la revisión de fase 2 y sus commits. Las futuras invitaciones individuales de socios requieren sus nombres de usuario y entrega privada de credenciales; no falta ese dato para utilizar la cuenta invitada existente ni la URL activa.
