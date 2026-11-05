# Manzanas Maracay

Aplicación para una distribuidora venezolana de frutas importadas. La fase 3 incorpora empaques configurables, recepción con precios, ventas FIFO, clientes, crédito, abonos y comprobantes comerciales PDF. La demo pública usa ejemplos sintéticos; la operación interna conserva autenticación.

Repositorio público autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama `phase-3/comercial-demo`, basada en `phase-2/inventario-staging` (`f9b532b`). El [PR #2 de fase 3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2) permanece en borrador contra la rama de fase 2; el [PR #1](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1) se conserva, sin merge. URL de pruebas: [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net). Release y verificación exactas en [staging](docs/staging.md).

**Fase 3 desplegada y verificada en staging:** `phase3-ef3d64616313`, construida desde `ef3d64616313b3a5f2184f37365dc751da07af29`, saludable el 5 de noviembre de 2026 a las 00:39:12 UTC. [Demo pública](https://manzanas.ganamosclub.net/demo) y [acceso interno](https://manzanas.ganamosclub.net/login). La web, API y esquema comerciales están activos; la publicación temporal solo web quedó sustituida. Los commits posteriores de documentación no cambian ese commit desplegado.

La verificación aprobó typecheck/build, **90 unitarias y 53 E2E**, once migraciones desde base limpia y desde fase 2, smoke comercial HTTPS con PDF y logo, y respaldo/restauración aislada posterior. La auditoría conservó los recursos ajenos y PostgreSQL propio; detalles y límites en el [informe de staging de fase 3](docs/verificacion-staging-fase3.json).

## Abrir localmente

Requiere Node.js 24.x y npm. En una terminal dentro del repositorio:

```powershell
npm ci
npm run dev
```

Abre **http://127.0.0.1:3100**. `/demo` no requiere cuenta; el acceso privado local está en `.local/auth-local.json`. No compartas ni versiones ese archivo. El iniciador genera secretos si faltan, inicia PostgreSQL exclusivo en `127.0.0.1:55432`, migra, prepara configuraciones y crea el usuario local. No instala servicios Windows. `Ctrl+C` detiene los procesos y conserva `.local/postgres`.

También existe `INICIAR.ps1`; si está bloqueado usa `npm run dev`, sin cambiar políticas globales. Dependencias y base necesitan aproximadamente 2 GB; navegador y capturas consumen espacio adicional.

## Flujos disponibles

- **Demo (`/demo`)**: catálogo, inventario, recepción, ventas y cobranza ficticias; sin consultar la base privada ni guardar operaciones.
- **Catálogo (`/catalogo`)**: frutas, variedad/calibre opcionales, línea comercial, modelo de empaque, presentaciones y precios promo/normal independientes. Datos desconocidos pendientes.
- **Recepciones (`/recepciones`)**: varias frutas, costo histórico por lote y cambio explícito de precios, confirmados atómicamente.
- **Inventario (`/inventario`)**: cajas selladas, fracciones y movimientos auditados; mitades comerciales sin inventar piezas; conteo cuando corresponde; ajustes y reversas admisibles.
- **Ventas (`/ventas`)**: cliente, varias líneas, precio negociado, contado/crédito, FIFO por recepción, costo y margen bruto, comprobante comercial PDF.
- **Clientes y cobranza (`/clientes`, `/cobranza`)**: saldos por comprobante, fechas pactadas/recordatorios, abonos con reparto explícito, recibos y WhatsApp manual. Push requiere opt-in de la tablet corporativa.
- **Proveedores (`/proveedores`)**: altas, cambios y desactivación conservando historia.

El calibre no determina cantidad de fruta. Caja abierta y contenido no se suman dos veces. Kiwi y granel admiten mitades comerciales; uva solo cajas; no se vende por pieza. El catálogo inicial no crea stock, clientes, precios ni tasas. Preserva ejemplos históricos de fase 2 identificados como DEMO sin convertirlos en reglas reales.

Los PDF **no son facturas fiscales SENIAT**. La fuente oficial BCV no pudo verificarse de forma confiable: se informa tasa no disponible y se bloquea VES; USD continúa. Sin tasa paralela ni envíos automáticos a clientes. Consultar [BCV](docs/bcv.md) y [push](docs/push-cobranza.md).

## Acceso y datos

Páginas y datos privados exigen sesión: scrypt, sesiones revocables de 8 horas con 30 minutos de inactividad, cookie `HttpOnly`, `SameSite=Strict` y `Secure` en staging. No hay registro público ni roles diferenciados. El proxy limita rutas y valida origen en mutaciones.

El operador invita mediante `npx tsx scripts/create-user.ts --file <archivo-privado>` siguiendo [autenticación](docs/authentication.md). El archivo contiene `username`, `displayName`, `password`; nunca pasar contraseñas por argumentos. `--reset` invalida sesiones anteriores. Staging no crea usuarios automáticamente.

`.env`, `.local`, invitaciones, respaldos y credenciales quedan fuera de Git. Staging tiene base exclusiva y operaciones DEMO marcadas por servidor. La PWA no guarda datos operativos ni confirma ventas sin conexión.

## Verificación

```powershell
npm run check
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npx playwright install chromium
npm run test:e2e
```

`check` ejecuta tipos, unitarios y build. Cierra el iniciador local antes de E2E: la suite administra sus servicios y escribe solo en `manzanas_maracay_test`, nunca en el VPS. `npm run db:stop` detiene únicamente la base identificada del proyecto.

Once migraciones, `0000`–`0010`; no reescribir aplicadas ni usar `db push`. Instalación limpia y actualización desde el commit exacto de fase 2: [reporte](docs/verificacion-migraciones-fase3.json). El script `scripts/verify-phase3-migrations.ts` solo admite bases temporales propias locales con `MM_APP_ENV=test`. Resultados nuevos y límites en [entrega de fase 3](docs/entrega-fase-3.md), separados de evidencia histórica.

## Organización

```text
apps/web/          Next.js, demo, operación privada y proxy
apps/api/          NestJS, sesiones, inventario, comercio, BCV y push
packages/domain/   Reglas, precisión decimal y contratos
packages/database/ Drizzle y migraciones PostgreSQL
scripts/           Arranque, pruebas, migraciones, usuarios y staging
.agents/skills/    Selección auditada y skill de integridad
```

`compose.yaml` ofrece desarrollo con volumen y puerto propios; no ejecutarlo junto a PostgreSQL portable. Docker no está instalado aquí; esa alternativa local requiere validación. Staging tiene verificación independiente documentada.

## Documentación

- [Plan](docs/plan-fase-3.md) y [entrega de fase 3](docs/entrega-fase-3.md)
- [Reglas](docs/domain-rules.md), [inventario](docs/inventory-model.md) y [arquitectura](docs/architecture.md)
- [Staging y respaldo](docs/staging.md), [infraestructura](docs/infrastructure.md) y [sesiones](docs/authentication.md)
- [Diseño](DESIGN.md), [marca](docs/brand-assets.md), [skills](docs/skills.md) y [seguridad](docs/revision-seguridad-fase-3.md)
- [Continuar en otro chat](docs/continuar-en-chatgpt.md)
- Historial: [fase 1](docs/entrega-fase-1.md), [fase 2](docs/entrega-fase-2.md)

No se declara producción lista: faltan respaldo externo seguro, revisión fiscal y validación en tablet real. Se conserva la incidencia histórica del alias `web`; el servicio actual usa exclusivamente `mm-staging-web`.
