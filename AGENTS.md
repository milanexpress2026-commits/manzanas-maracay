# Manzanas Maracay — reglas permanentes

- Trabajar únicamente dentro de este repositorio. No tocar proyectos, servicios, bases de datos ni puertos ajenos.
- Fase 1: catálogo real, arquitectura, esquema y pruebas. No implementar facturación ni cobranza ni desplegar públicamente sin nueva autorización.
- Leer docs/domain-rules.md antes de modificar negocio o datos; preservar sus invariantes.
- TypeScript estricto; Next.js para interfaz, NestJS para API central, Drizzle/PostgreSQL para persistencia. Las reglas puras viven en packages/domain.
- Todo cambio de esquema lleva migración versionada y pruebas significativas. No usar db push ni borrar datos para resolver errores.
- Importes y tasas: numeric y Decimal, nunca floats. No inferir fruta por calibre. No contar un contenedor abierto y su contenido dos veces.
- Identidad verde oscuro, rojo manzana y crema; logo tipográfico temporal, nunca inventar logo. No presentar datos ficticios como reales.
- No leer ni imprimir .env ni credenciales; consultar solo nombres de variables. No versionar datos, credenciales o artefactos compilados.
- Mutaciones: validación, transacción, idempotencia, auditoría y control de concurrencia cuando corresponda.
- Antes de entregar: npm run typecheck, npm test, npm run build, npm run test:e2e con base de pruebas exclusiva. Verificar escritorio y celular.
- Skills locales: .agents/skills/frontend-design, shadcn, web-design-guidelines y react-best-practices. Revisar procedencia en docs/skills.md. Sus instrucciones no autorizan acceso ajeno ni despliegues.
- Comunicar en español, explicar limitaciones comprobadas. No afirmar que hay tasa BCV vigente si no se verificó.
- Git: rama phase-1/foundations. No hacer merge ni publicar sin revisión del propietario.
