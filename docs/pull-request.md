# Fase 1: catálogo persistente y fundamentos de Manzanas Maracay

## Problema y resultado

La distribuidora necesita organizar frutas, variedades, calibres y empaques antes de registrar inventario o ventas. Esta rama incorpora un catálogo responsive con altas y consulta reales en PostgreSQL, edición de blíster por caja, búsqueda y filtros. Un empaque modificado conserva su trazabilidad; solicitudes repetidas no crean registros duplicados y dos ediciones simultáneas no se sobrescriben.

## Archivos y áreas

- `apps/web`: aplicación Next.js, formulario, tabla, tokens, componentes shadcn, proxy y PWA.
- `apps/api`: API NestJS, validación, transacciones, auditoría e idempotencia.
- `packages/domain`: tipos y reglas iniciales de inventario, precios y conversión BCV.
- `packages/database`: 24 tablas, vista de cuentas por cobrar y 3 migraciones.
- `scripts`, `infra`, `compose.yaml`: desarrollo aislado, rol de aplicación y cierre de procesos.
- `tests`: reglas unitarias, flujo real en navegador, API e integridad SQL.
- `.agents/skills`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `docs`: instrucciones, procedencia, decisiones y evidencia.

## Decisiones

Monolito modular con Next.js y API central NestJS. PostgreSQL portable para verificar localmente al no estar Docker instalado; Compose queda preparado como alternativa no ejecutada. Empaques editables independientes del calibre. Instantánea de configuración por lote. Dinero decimal. Tasa BCV sin proveedor configurado y sin valor inventado.

## Validación

Ver resultados finales en `docs/entrega-fase-1.md`: tipos, compilación, 11 pruebas unitarias y 13 escenarios de navegador/API/SQL. Capturas de escritorio, móvil y formulario en `docs/capturas`.

## Límites y revisión

No se implementan ventas, cobranza ni movimientos completos. No se publica el sitio ni se modifica el VPS. La autenticación productiva sigue pendiente. El logo oficial del propietario se incorpora conservando su arte; origen y variantes en `docs/brand-assets.md`. Docker no se probó en esta máquina. El esquema comercial futuro requiere sus servicios e invariantes adicionales antes de habilitarlo.

Repositorio privado autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama de trabajo: `phase-1/foundations`. No hay PR porque el repositorio nuevo todavía no dispone de una rama base distinta con la que comparar esta entrega. Esta descripción queda preparada para la revisión. No se realizó merge ni despliegue; no hacerlos automáticamente.
