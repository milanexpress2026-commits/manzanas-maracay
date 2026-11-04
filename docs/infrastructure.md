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

No se proporcionó ni se detectó un remoto autorizado de Manzanas Maracay. No se creó un repositorio público ni se envió código a uno ajeno. El código queda en Git local y la descripción del PR está preparada.

Para habilitar revisión: crear o indicar el repositorio de este proyecto, autenticar Git/GitHub en el propio equipo (o conectar el plugin GitHub), añadir ese remoto y subir `phase-1/foundations`. No pegar tokens, contraseñas ni llaves en el chat. Crear el PR hacia la rama base elegida; no hacer merge automático.
