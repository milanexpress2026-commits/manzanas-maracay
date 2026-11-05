# Manzanas Maracay

Aplicación para una distribuidora venezolana de frutas importadas: empaques configurables, recepciones, inventario, ventas FIFO, clientes, crédito, abonos y comprobantes comerciales PDF. La fase 4 añade producción independiente, datos comerciales inicialmente vacíos, acceso privado de dueños y la opción «Mantener sesión activa» durante 30 días.

Repositorio público autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama actual `phase-4/produccion-separada`, basada en la fase 3 verificada (`f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94`). Código actual 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0, publicado en el [PR #3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/3). El [PR #2](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2) y el [PR #1](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1) se conservan sin merge. Estado de código, pruebas, recursos remotos y publicación en la [entrega de fase 4](docs/entrega-fase-4-produccion.md).

**Producción publicada y activa para operación interna en USD:** [entrar a Manzanas Maracay](https://manzanas.ganamosclub.net/login). Release phase4-2a81817fe2c1, habilitada con autorización específica del propietario el 5 de noviembre de 2026 a las 12:04:09 UTC. La raíz dirige al acceso o al inicio privado según sesión; /demo responde HTTP 404. Staging permanece interno en loopback 33100.

Verificación del código actual: tipos/build y **137 unitarias**, además de **12/12 escenarios HTTPS de producción aislada** repetidos después de unificar la validación de contraseña de alta y renovación (8–256 caracteres). Ejecución 15e7b61dec37a0978b7f3451, 5 de noviembre de 2026, 07:54:15–07:56:43 UTC, con base temporal retirada. Las trece migraciones fresh/upgrade y los **53/53 E2E de regresión** corresponden a la implementación previa 49044263d6f74940e388817179ba6df3eff1f8ba; no se presentan como una repetición posterior. La revisión de seis capturas corresponde al ensayo 67a94e711faec9abdb1bff9a; la interfaz no cambió con la corrección. [Evidencia local](docs/verificacion-fase4-local.json).

**Verificación remota completada:** HTTPS estricto, opción «Mantener sesión activa», cookie de 30 días, sesión activa y logout con rechazo de la cookie anterior. La base comenzó con 19 tablas comerciales vacías y una cuenta legítima. Copia externa cifrada y restauración verificadas; cron propio instalado a las 12:05:58 UTC tras comprobar respaldo, restauración y monitor. Rutas anteriores y aplicaciones compartidas preservadas, sin reiniciar el proxy. No se crearon ventas o cobros reales para el smoke. VES sigue bloqueado y los PDF son comerciales, no fiscales. [Evidencia remota](docs/verificacion-produccion-fase4.json).

## Abrir localmente

Requiere Node.js 24.x y npm. En una terminal dentro del repositorio:

```powershell
npm ci
npm run dev
```

Abre **http://127.0.0.1:3100**. `/demo` no requiere cuenta; el acceso privado local está en `.local/auth-local.json`. No compartas ni versiones ese archivo. El iniciador genera secretos si faltan, inicia PostgreSQL exclusivo en `127.0.0.1:55432`, migra, prepara configuraciones y crea el usuario local. No instala servicios Windows. `Ctrl+C` detiene los procesos y conserva `.local/postgres`.

También existe `INICIAR.ps1`; si está bloqueado usa `npm run dev`, sin cambiar políticas globales. Dependencias y base necesitan aproximadamente 2 GB; navegador y capturas consumen espacio adicional.

## Flujos disponibles

- **Demo local o de QA (/demo, deshabilitada en producción)**: catálogo, inventario, recepción, ventas y cobranza ficticias; sin consultar la base privada ni guardar operaciones.
- **Catálogo (`/catalogo`)**: frutas, variedad/calibre opcionales, línea comercial, modelo de empaque, presentaciones y precios promo/normal independientes. Datos desconocidos pendientes.
- **Recepciones (`/recepciones`)**: varias frutas, costo histórico por lote y cambio explícito de precios, confirmados atómicamente.
- **Inventario (`/inventario`)**: cajas selladas, fracciones y movimientos auditados; mitades comerciales sin inventar piezas; conteo cuando corresponde; ajustes y reversas admisibles.
- **Ventas (`/ventas`)**: cliente, varias líneas, precio negociado, contado/crédito, FIFO por recepción, costo y margen bruto, comprobante comercial PDF.
- **Clientes y cobranza (`/clientes`, `/cobranza`)**: saldos por comprobante, fechas pactadas/recordatorios, abonos con reparto explícito, recibos y WhatsApp manual. Push requiere opt-in de la tablet corporativa.
- **Proveedores (`/proveedores`)**: altas, cambios y desactivación conservando historia.

El calibre no determina cantidad de fruta. Caja abierta y contenido no se suman dos veces. Kiwi y granel admiten mitades comerciales; uva solo cajas; no se vende por pieza. El catálogo inicial no crea stock, clientes, precios ni tasas. Preserva ejemplos históricos de fase 2 identificados como DEMO sin convertirlos en reglas reales.

Los PDF **no son facturas fiscales SENIAT**. La fuente oficial BCV no pudo verificarse de forma confiable: se informa tasa no disponible y se bloquea VES; USD continúa. Sin tasa paralela ni envíos automáticos a clientes. Consultar [BCV](docs/bcv.md) y [push](docs/push-cobranza.md).

## Acceso y datos

Páginas y datos privados exigen sesión: scrypt, sesiones revocables de 8 horas con 30 minutos de inactividad, o 30 días al marcar «Mantener sesión activa». Cookie `HttpOnly`, `SameSite=Strict` y `Secure` en staging/producción. Cerrar sesión y restablecer la contraseña revocan el acceso. No hay registro público; el propietario eligió una cuenta privada compartida. El proxy limita rutas y valida origen en mutaciones.

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

Trece migraciones, `0000`–`0012`; no reescribir aplicadas ni usar `db push`. Instalación limpia y actualización desde el commit exacto de fase 3: [reporte](docs/verificacion-migraciones-fase4.json). `scripts/verify-phase4-migrations.ts` usa bases temporales propias locales. `node scripts/test-production.mjs` ensaya producción con HTTPS local, gate sintético y otra base temporal; jamás se dirige al VPS. El ensayo elimina su base marcada y detiene sus procesos al terminar.

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

- [Plan](docs/plan-fase-4.md) y [entrega de fase 4](docs/entrega-fase-4-produccion.md)
- [Operación real](docs/operacion-real.md), [producción](docs/despliegue-produccion.md), [backup](docs/backup-produccion.md) y [pendientes](docs/pendientes-comerciales.md)
- [Reglas](docs/domain-rules.md), [inventario](docs/inventory-model.md) y [arquitectura](docs/architecture.md)
- [Staging y respaldo](docs/staging.md), [infraestructura](docs/infrastructure.md) y [sesiones](docs/authentication.md)
- [Diseño](DESIGN.md), [marca](docs/brand-assets.md), [skills](docs/skills.md) y [seguridad](docs/revision-seguridad-fase-3.md)
- [Continuar en otro chat](docs/continuar-en-chatgpt.md)
- Historial: [fase 1](docs/entrega-fase-1.md), [fase 2](docs/entrega-fase-2.md), [fase 3](docs/entrega-fase-3.md)

La operación interna en USD está habilitada; VES, procedimiento fiscal y tablet real conservan sus pendientes externos. El cron no automatiza la copia externa, alertas a terceros ni eliminación de respaldos. Se conserva la incidencia histórica del alias `web`; los servicios exclusivos son `mm-staging-web` y `mm-production-web`.
