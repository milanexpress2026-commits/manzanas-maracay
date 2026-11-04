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
