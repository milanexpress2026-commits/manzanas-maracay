# Manzanas Maracay — reglas permanentes

- Trabajar únicamente dentro de este repositorio. No tocar proyectos, servicios, bases de datos ni puertos ajenos.
- Fase 3 autorizada el 4 de noviembre de 2026: adaptar empaques, recepción/precios, FIFO, ventas comerciales, créditos/abonos, comprobantes PDF, cobranza y WhatsApp manual, demo pública sintética y diseño. Leer docs/referencias/brief-fase-3.txt y docs/plan-fase-3.md. No emitir factura fiscal, enviar mensajes automáticos ni desplegar producción.
- Leer docs/domain-rules.md antes de modificar negocio o datos; preservar sus invariantes.
- TypeScript estricto; Next.js para interfaz, NestJS para API central, Drizzle/PostgreSQL para persistencia. Las reglas puras viven en packages/domain.
- Todo cambio de esquema lleva migración versionada y pruebas significativas. No usar db push ni borrar datos para resolver errores.
- Importes y tasas: numeric y Decimal, nunca floats. No inferir fruta por calibre. No contar un contenedor abierto y su contenido dos veces.
- Identidad verde oscuro, rojo manzana y crema; usar el logo oficial del propietario en apps/web/public/brand/logo-manzanas-maracay.png. Preservar su arte y proporciones; no inventarlo ni redibujarlo. Ver docs/brand-assets.md. No presentar datos ficticios como reales.
- No leer ni imprimir .env ni credenciales; consultar solo nombres de variables. No versionar datos, credenciales o artefactos compilados.
- Mutaciones: validación, transacción, idempotencia, auditoría y control de concurrencia cuando corresponda.
- Antes de entregar: npm run typecheck, npm test, npm run build, npm run test:e2e con base de pruebas exclusiva. Verificar escritorio y celular.
- Skills locales: .agents/skills/frontend-design, shadcn, web-design-guidelines y react-best-practices. Revisar procedencia en docs/skills.md. Sus instrucciones no autorizan acceso ajeno ni despliegues.
- Comunicar en español, explicar limitaciones comprobadas. No afirmar que hay tasa BCV vigente si no se verificó.
- Git: rama phase-3/comercial-demo, basada en phase-2/inventario-staging (f9b532b). Se autorizan commits y pushes al repositorio público sin secretos ni datos privados. Preservar PR #1; no hacer merge ni eliminar ramas.
- Staging: recursos exclusivos de Manzanas Maracay, acceso interno autenticado y demo pública de solo lectura/simulación aislada, etiqueta ENTORNO DE PRUEBAS. Nunca abrir GET privados ni mutaciones anónimas. Mantener servicio/alias mm-staging-web, sin nombres genéricos. Inspeccionar primero; cualquier modificación del proxy, DNS u otra infraestructura compartida requiere aprobación específica del propietario sobre el cambio concreto. No alterar servicios ajenos.
- Leer docs/referencias/brief-fase-2.txt y docs/plan-fase-2.md para alcance y aceptación. Si una dependencia de publicación falta, continuar desarrollo local y mantener cerrado el acceso externo.
