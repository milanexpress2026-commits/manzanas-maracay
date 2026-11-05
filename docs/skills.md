# Skills del proyecto

Se instalaron únicamente en `.agents/skills`. Las globales ya disponibles se consultaron cuando fueron útiles, sin modificarlas. Las Skills locales quedan disponibles para las próximas interacciones de Codex al trabajar en esta carpeta.

| Skill                         | Repositorio oficial y ubicación                                                                                | Revisión fijada                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `frontend-design`             | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design)                     | `ca45fc496a3436251f191354091d557da31c15b5` |
| `shadcn`                      | [shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/main/skills/shadcn)                                        | `8a3536678a528cc012b9e62484290e79d0be410f` |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)  | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` |
| `web-design-guidelines`       | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` |

El nombre de invocación de la guía React es `vercel-react-best-practices`, aunque su carpeta oficial sigue llamándose `react-best-practices`. La Skill oficial de componentes se llama `shadcn`, según [la documentación de shadcn/ui](https://ui.shadcn.com/docs/skills). Vercel declara compatibilidad con Codex en [su publicación oficial](https://vercel.com/blog/introducing-react-best-practices); shadcn incluye metadatos `agents/openai.yml`. Todas utilizan la estructura local `SKILL.md` reconocida por Codex.

## Revisión previa a instalar

- Se leyó cada `SKILL.md` desde una revisión fija y se enumeraron sus archivos.
- Frontend Design: instrucciones y licencia, sin scripts ejecutables ni dependencias de runtime.
- React Best Practices: Markdown, reglas y metadatos; no scripts de instalación propios.
- Web Design Guidelines: Markdown y lectura de una guía pública; no acceso a secretos.
- shadcn: referencias Markdown, ejemplos TSX, iconos PNG, metadatos y `scripts/showcase-coverage.mjs`. Se revisó el script completo: recorre directorios indicados y lee imports para reportar cobertura; no hace escrituras, red ni operaciones de sistema. No fue necesario ejecutarlo.
- No se detectaron instrucciones para extraer credenciales, destruir datos o acceder a otros proyectos. La Skill de shadcn propone herramientas de su propio CLI; se usaron solo `info`, `docs` y `add` sobre la nueva aplicación, sin `--overwrite`.
- La instalación se hizo con el instalador de Skills de Codex, `--ref` fijado y `--dest` dentro del proyecto. No hubo instalación global.

## Uso

- “Usa frontend-design para extender el catálogo conservando DESIGN.md”.
- “Usa shadcn para agregar un componente accesible en apps/web”.
- “Aplica vercel-react-best-practices a las consultas y componentes del catálogo”.
- “Usa web-design-guidelines para revisar apps/web/src”.

Las reglas permanentes de `AGENTS.md` y el alcance del propietario tienen prioridad. Una Skill no autoriza desplegar, tocar otros proyectos ni enviar información privada.

## Aplicación en esta fase

Frontend Design orientó la identidad derivada de las referencias. shadcn generó 12 componentes reutilizables, con Radix, a través de su CLI oficial. Se sustituyó el import auxiliar generado `cn` por la utilidad local existente para mantener el patrón del proyecto. La guía React orientó la separación del servidor y el cliente y evitó consultas por fila; las consultas de una misma transacción se ejecutan secuencialmente para respetar el driver PostgreSQL. Web Design Guidelines guio la revisión de foco, etiquetas, contraste, estados y tamaño móvil.

También se consultaron las Skills preexistentes de PostgreSQL, pruebas web, Sites (ruta local sin publicación) e Impeccable. El cargador de contexto de Impeccable no pudo iniciar por permisos de su caché global; se continuó leyendo las referencias y el contexto del proyecto. No se instaló su motor ni se cambió el entorno global.

## Fase 3: selección auditada y fijada

Auditoría del 4 de noviembre de 2026 por repositorios y API oficiales de GitHub. Las cuatro skills previas se conservan. Se añadieron seis paquetes selectivos, únicamente en `.agents/skills`, mediante el instalador de Codex con `--ref` fijo. Se compararon los 94 archivos instalados con la fuente del commit; [skills-phase3-lock.json](skills-phase3-lock.json) conserva rutas, licencias y SHA-256 por archivo. Las skills quedan disponibles en las siguientes interacciones de Codex en este proyecto.

| Skill                            | Origen y revisión fijada                                                                                                                   | Licencia                                               | Aporte                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| supabase-postgres-best-practices | [Supabase](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | MIT                                                    | PostgreSQL propio, índices, permisos y bloqueo consistente; sin migrar a Supabase.                       |
| docker-compose-patterns          | [Docker](https://github.com/docker/skills/tree/090ff3d39db5f8bc55d4e951c26218e7c95ea2d3/skills/docker-compose-patterns)                    | Apache-2.0                                             | Dependencias saludables, redes, secretos y validación quiet.                                             |
| docker-build-strategies          | [Docker](https://github.com/docker/skills/tree/090ff3d39db5f8bc55d4e951c26218e7c95ea2d3/skills/docker-build-strategies)                    | Apache-2.0                                             | Etapas de build, contexto sin secretos y usuario sin privilegios.                                        |
| docker-destructive-guardrails    | [Docker](https://github.com/docker/skills/tree/090ff3d39db5f8bc55d4e951c26218e7c95ea2d3/skills/docker-destructive-guardrails)              | Apache-2.0                                             | Evitar barridos; identificar recursos propios y pérdida antes de cualquier borrado.                      |
| security-review                  | [Sentry](https://github.com/getsentry/skills/tree/0c464f411bdfb8d4c12314b36264d06cb2f60270/skills/security-review)                         | Referencias OWASP CC BY-SA 4.0; repositorio Apache-2.0 | Trazar datos, controles y explotabilidad de sesión, demo y operaciones. Ambas atribuciones se conservan. |
| review-animations                | [Emil Kowalski](https://github.com/emilkowalski/skills/tree/c8a79627b59d72d764d6ab6f2c87c09a48169833/skills/review-animations)             | MIT                                                    | Movimiento justificado, interrupción, foco, reducción de movimiento y rendimiento.                       |

Los paquetes PG, seguridad y animaciones son instrucciones/referencias, sin ejecutables. Docker incluye dos scripts revisados completos: `verify-compose.sh` valida configuración sin imprimir interpolaciones; `verify-build.sh` construye una imagen del directorio actual y consulta tamaño/usuario, por lo que sí modifica caché e imágenes. No se ejecutaron durante la auditoría de procedencia. Su disponibilidad no autoriza ejecuciones fuera del proyecto.

### Prevalencia del alcance del proyecto

- Los ejemplos Docker `web`/`db` no se copian a la red compartida: se mantiene `mm-staging-web`, prioridad de gateway y alias exclusivos. Se conservan los reinicios limitados del proyecto, aunque una guía general proponga `unless-stopped`.
- La exclusión genérica de Sentry para código que requiere autenticación no se aplica a esta revisión: ventas, cobros, idempotencia, referencias cruzadas y manipulación de identificadores autenticados forman parte expresa del alcance del propietario.
- Las preferencias de una guía de animación se ponderan frente a accesibilidad, frecuencia real y formularios operativos; no retrasar confirmaciones ni alterar saldos por animaciones.
- Ninguna skill concede autorización de lectura de secretos, infraestructura ajena, publicación, borrados o mensajes. La autorización del usuario y las reglas del proyecto prevalecen.

### Recursos evaluados que no se instalaron

| Recurso y commit auditado                                                                                                                    | Decisión                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli/tree/f50f57905b9fd3dd355330719ddf0687000c9437), Apache-2.0            | La skill existe y ofrece CLI portable. Duplica Playwright ya instalado; se usan sus APIs existentes para video y contextos. No instalar global, no comandos kill-all ni estado de sesiones personales.                                                                                                                                             |
| [obra/superpowers](https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7), MIT                                   | Las tres skills solicitadas existen. TDD exige borrar implementación; systematic-debugging depende de otras skills y fija pausas; verification-before-completion prescribe repetición integral en cada mensaje. No se importan esos flujos conflictivos. Se mantienen regresiones significativas, causa raíz y evidencia verificable por revisión. |
| [Motion AI Kit](https://github.com/motiondivision/ai-kit/tree/1e424943582cbbdb6e3f410687e39f96451447bb)                                      | Skill presente, pero sin archivo LICENSE ni licencia declarada por API en esta revisión. Parte de las funciones depende de MCP y Motion+. No instalar/conectar ni contratar; consultar [docs oficiales](https://motion.dev/docs/ai-kit).                                                                                                           |
| [Emil animate](https://github.com/emilkowalski/skills/tree/c8a79627b59d72d764d6ab6f2c87c09a48169833/skills/animate), MIT                     | Instrucciones y recetas presentes, sin ejecutables. Se elige review-animations para no duplicar la guía de implementación visual existente.                                                                                                                                                                                                        |
| [Sentry security-model](https://github.com/getsentry/skills/tree/0c464f411bdfb8d4c12314b36264d06cb2f60270/skills/security-model), Apache-2.0 | Formato de política y dos scripts Python de resolución, no ejecutados. No añadir una segunda política con nuevas exclusiones; documentar amenazas y controles de esta aplicación y revisar con security-review.                                                                                                                                    |
| [Impeccable](https://github.com/pbakaus/impeccable/tree/5af4319c4e7a7ee3e5e2b9fe899bcfb21c6190cb), Apache-2.0                                | Ya disponible globalmente. Se inspeccionó launcher Windows/Unix: puede descargar motor con checksums y escribir caché en home. No duplicar motor, hooks ni configuración. Las referencias existentes siguen utilizándose conforme a su skill.                                                                                                      |

La procedencia del autor y un repositorio activo no garantizan seguridad. Los commits y contenidos fijados permiten repetir la revisión. No se ejecutaron instaladores de colecciones completas ni scripts remotos de esos repositorios.

### Skill propia y evidencia de aplicación

[manzanas-inventory-integrity](../.agents/skills/manzanas-inventory-integrity/SKILL.md) es una guía local sin scripts que remite a [domain-rules.md](domain-rules.md), exige evidencia de comandos/costos/stock y conecta cada invariante con un caso ejecutable. Invocación: “Aplica manzanas-inventory-integrity a esta modificación de inventario o cobranza”. No duplica el catálogo comercial ni transforma datos pendientes en reglas.

Aplicación inicial comprobada: el proveedor BCV usa lectura acotada de la caché privada, conserva metadatos y cierra conversiones ante una tasa ambigua/insegura. Sus 18 pruebas focalizadas de `tests/unit/bcv.test.ts` se ejecutaron con éxito; esto no sustituye las pruebas de pagos integradas ni una verificación real de BCV. La matriz final de la fase debe registrar el uso de las demás skills en revisiones y pruebas efectivamente terminadas.

La revisión posterior aplicó `security-review` junto con la skill global `security-best-practices` a las fronteras de sesión, demo, proxy, PDF, SQL, BCV y push; sus resultados y límites están en [revision-seguridad-fase-3.md](revision-seguridad-fase-3.md). La guía de integridad orientó la reproducción de un costo histórico restaurado incorrectamente: tres regresiones fallaron antes de la corrección y pasaron después. Las pruebas de lifecycle de push acreditan, con transporte y PostgreSQL simulados, que configurar VAPID sin una tablet activa no provoca envíos. No se atribuye a esas pruebas una entrega real en Android ni una validación del despliegue.

## Fase 4: aplicación efectiva

Se reutilizaron las skills y referencias existentes, sin añadir colecciones, motores ni instalaciones globales. Su lectura no reemplaza una prueba ejecutada ni concede autorización sobre infraestructura compartida.

| Guía                                      | Aplicación concreta                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integridad y PostgreSQL                   | Vínculo persistente de entorno, producción vacía, rechazo DEMO/real, permisos de owner/API y RLS. Ensayos comerciales y restauración incluyen stock, costos, saldos y ACL.                                                                                                |
| Seguridad local y security-best-practices | Origen, cookies, revocación, activación ligada a release/base y secretos por archivo. La revisión independiente detectó y corrigió el dump incompleto/inviable con owner bajo FORCE RLS, el argumento perdido de invite --reset y la recuperación tras reinicio del host. |
| Guías Docker                              | Compose exclusivo, imágenes fijadas, build sin secretos, redes internas, alias propio y comprobación de identidad antes de actuar. Sin limpieza global ni cambios ajenos.                                                                                                 |
| Frontend Design, Impeccable y React       | Inicio con datos reales, onboarding plegable, estados vacíos/errores y acceso compartido con persistencia opcional. Documentación instalada de Next16 para bloquear demo antes del streaming.                                                                             |
| Review Animations y pruebas web           | Se conservaron transiciones existentes sin añadir movimiento a acciones frecuentes; foco, movimiento reducido, axe, desbordamiento y capturas Chromium. No se atribuye rendimiento ni entrega push en tablet física.                                                      |

El launcher de Impeccable no pudo iniciar por restricciones de caché/descarga; se leyeron directamente contexto y referencias existentes, sin instalar el motor ni modificar el entorno global. Esa lectura no es una auditoría automática ejecutada.

### Excepción deliberada: reinicio de producción

La política histórica de reinicios limitados sigue aplicándose a **staging**. En el Compose exclusivo de producción, PostgreSQL, API y web usan **unless-stopped** para recuperarse después de reiniciar host o daemon Docker; migración/invitación usan **restart: no**. Esta decisión corrige un riesgo operativo concreto y no modifica servicios ajenos. El gate vuelve a comprobarse tras el reinicio: reiniciar no autoriza escrituras ni convierte QA en operación real.

La evidencia final está en [verificacion-fase4-local.json](verificacion-fase4-local.json): 12 escenarios production aislados aprobados y recursos temporales retirados. [Revisión visual](visual-review-fase-4.md) y [seguridad](revision-seguridad-fase-4.md) detallan sus límites. La aprobación local no acredita todavía respaldo externo real, publicación ni autorización del cambio de proxy.
