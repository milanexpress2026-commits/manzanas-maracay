# Inspección segura del entorno

Inspección del 4 de noviembre de 2026. No se copiaron credenciales al repositorio. El archivo privado proporcionado por el propietario se utilizó únicamente para establecer SSH con comprobación del servidor conocido.

## Computadora local

- Windows 10, compilación 19045, 4 procesadores lógicos disponibles para el entorno.
- Node.js 24.19.0, npm 11.17.0 y Git 2.55.0.
- Docker, CLI de PostgreSQL y GitHub CLI no estaban disponibles en PATH.
- La consulta de memoria y CPU por CIM estuvo restringida al inicio; no se inventaron cifras de RAM local.
- Espacio libre inicial aproximado: 9 GB. Dependencias, Chromium y PostgreSQL se instalaron dentro del proyecto; no se instalaron servicios globales.
- No existía un repositorio en la carpeta inicial. Se creó un repositorio exclusivo en `outputs/manzanas-maracay`, rama `phase-1/foundations`.
- Se inspeccionaron puertos antes de elegir 3100, 3101 y 55432. No se reutilizaron bases existentes.

## VPS Contabo

Se ejecutaron únicamente lecturas: `/etc/os-release`, `nproc`, `free`, `df`, versiones, `docker ps`, `ss -lnt` y nombres de servicios activos. No se consultaron variables de contenedores, archivos de aplicación, secretos, datos comerciales ni bases de otros proyectos.

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

No se ejecutó `docker compose up`, ningún reinicio, migración remota, limpieza de Docker, cambio de firewall, DNS, Caddy/Nginx ni certificados. No se creó todavía una carpeta remota de esta aplicación. El hosting pago no se utilizó.

La capacidad observada permite evaluar posteriormente un despliegue aislado, pero esta inspección no mide la carga máxima ni garantiza capacidad futura. Antes de publicar se revisarán copias de seguridad, autenticación, dominio, puertos internos, límites y los archivos concretos de despliegue con el propietario.

## Base local

PostgreSQL 18.6 real, empaquetado por `embedded-postgres` 18.6.0-beta.19, con binarios dentro de `node_modules`. Datos persistentes en `.local/postgres`, puerto 55432 ligado solo a loopback. Usuarios independientes de cualquier VPS: `mm_owner` para preparación y `mm_app` sin privilegios de superusuario para el catálogo.

Durante QA se resolvió un problema de Windows: el cierre del grupo de procesos de Playwright podía dejar un hijo de PostgreSQL abierto. El ejecutor de pruebas ahora posee PostgreSQL fuera del grupo del navegador y lo cierra mediante `pg_ctl` después de verificar el directorio y puerto del archivo PID. Los registros se conservan. La corrección no requirió detener aplicaciones ajenas.

## GitHub

Repositorio público autorizado por el propietario: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). La rama de trabajo es `phase-1/foundations`. Esta autorización corresponde al código de Manzanas Maracay; no incluye publicar la aplicación ni acceder a proyectos ajenos. El cambio de visibilidad no modifica el VPS.

No hay PR: el repositorio es nuevo y todavía no dispone de una rama base distinta para comparar esta primera entrega. La descripción de revisión se conserva en `docs/pull-request.md`. No se realizó merge ni despliegue. Las credenciales, llaves, bases locales y dependencias quedan fuera del código versionado; no compartirlas en el chat.
