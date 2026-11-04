# Continuar la revisión de Manzanas Maracay

Repositorio público autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama actual: `phase-2/inventario-staging`, basada en `phase-1/foundations`.

Este texto traslada el contexto a otro chat sin compartir credenciales. La fase 2 fue autorizada y está implementada para revisión; su validación final y el estado de publicación deben verificarse en la entrega y la documentación de infraestructura. El código público no permite entrar en la aplicación sin una sesión invitada.

## Prompt para copiar

```text
Quiero que revises el proyecto Manzanas Maracay, una aplicación para una distribuidora venezolana de frutas importadas.

Repositorio: https://github.com/milanexpress2026-commits/manzanas-maracay
Rama: phase-2/inventario-staging
URL de staging confirmada: https://manzanas.ganamosclub.net

Antes de proponer cambios, lee AGENTS.md, README.md, PRODUCT.md, DESIGN.md, docs/domain-rules.md, docs/architecture.md, docs/plan-fase-2.md, docs/revision-fase-1.md y docs/inventory-model.md. Consulta docs/infrastructure.md y la entrega de fase 2, si existe, para el estado real de publicación y pruebas. No deduzcas que el dominio ya está publicado o que todas las pruebas pasaron: estaban pendientes de cierre al preparar este texto.

La fase 2 fue autorizada. Conserva el catálogo de frutas, variedades, calibres y empaques de fase 1 y añade proveedores, recepción multilínea por cajas, lotes con empaque/costo históricos e inventario transaccional. Permite abrir cajas y blíster, retirar blíster priorizando cajas abiertas, preparar medias cajas con conteo, ajustar con motivo y revertir el último movimiento del lote sin borrar historia. Hay autenticación por usuarios invitados, sesiones revocables, cookies protegidas y auditoría con actor autenticado. No hay registro público ni roles diferenciados.

La API NestJS es la autoridad comercial; Next.js presenta la interfaz y actúa como proxy del mismo origen. PostgreSQL guarda el ledger y la proyección con restricciones diferidas. El esquema tiene seis migraciones de 0000 a 0005: 0003 habilita inventario, 0004 sesiones y 0005 impide añadir entradas a un movimiento ya confirmado. No reescribas migraciones aplicadas ni uses db push. Los contratos están en packages/domain/src/inventory.ts.

Preserva las reglas: calibre es clasificación, nunca cantidad de frutas; cada caja/blíster tiene identidad; una caja abierta y su contenido no se cuentan dos veces; piezas desconocidas se guardan como null; los fraccionamientos usan conteo físico y 37 = 18 + 19; costos y tasas usan precisión decimal. Reintentar una solicitud exige conservar su clave de idempotencia. Un retiro interno no crea una venta ni una deuda. Nunca inventes una tasa BCV.

La recepción de esta fase admite cajas cerradas, hasta 50 líneas y 1.000 cajas. El inventario usa un almacén inicial y un bloqueo conservador global del árbol; no asumas soporte de transferencias o escala ilimitada. Staging y pruebas tienen bases separadas y recepciones DEMO. Ventas, facturación, cobranza, WhatsApp y BCV en vivo siguen fuera de alcance.

Para validar localmente: npm ci, npm run dev y acceso privado en .local/auth-local.json. No imprimas ni copies ese archivo. Los checks son npm run check y npm run test:e2e; este último usa manzanas_maracay_test y gestiona sus servicios. No ejecutes pruebas contra staging. Consulta README para instalar Chromium y evitar conflicto de puertos.

El logo oficial ya está integrado: conserva apps/web/public/brand/logo-manzanas-maracay.png, sin redibujarlo ni deformarlo. Las imágenes conceptuales de docs/referencias y las capturas de fase 1 son referencias históricas, no evidencia de funciones nuevas. Lee docs/brand-assets.md.

Primero resume lo construido e identifica problemas verificables, distinguiendo implementación, pruebas ejecutadas y despliegue. No avances a facturación u otra fase sin autorización. No hagas merge, no despliegues producción y no modifiques proyectos ajenos. Cualquier nuevo cambio en DNS/proxy compartidos requiere la autorización concreta del propietario. No solicites ni expongas contraseñas, tokens, llaves o .env. Si no puedes leer el repositorio o un archivo, dilo y no supongas su contenido. Explica tus conclusiones en español sencillo.
```

La [entrega de fase 1](entrega-fase-1.md) conserva su evidencia original; los resultados de aquella fase no sustituyen las comprobaciones de esta rama.
