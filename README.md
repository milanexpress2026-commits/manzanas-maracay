# Manzanas Maracay

Aplicación privada para una distribuidora venezolana de frutas importadas: recepción de mercancía, inventario por empaque y lote, ventas con precio manual, clientes, crédito, abonos y documentos comerciales PDF.

**Producción actual: V4.8 publicada y saludable**, código `03b2d6970ea0f3d1a0a6dc60d0bfbdff68e442df`, con **16 migraciones, sin migraciones nuevas en esta actualización**. [Entrar a Manzanas Maracay](https://manzanas.ganamosclub.net/login). La publicación autorizada conservó el acceso y los datos existentes. La raíz dirige al acceso o al inicio privado; `/demo` permanece deshabilitada en producción. [Verificación V4.8](docs/verificacion-v4-8.json) y [publicación](docs/promocion-v4-8.md).

**V4.8 aprobada y publicada:** rama `feature/disponibilidad-v4-8`, [PR #9](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/9). La cuarta QA aprobó **419 unitarias, 34 dirigidas, 149 E2E en una ejecución y 13 casos de producción aislada**, además de tipos/builds y migraciones; staging aprobó **29 comprobaciones**. La versión comprueba la disponibilidad del carrito completo, cantidades y refresco de existencias, y conserva el borrador ante conflictos. También muestra la última BCV oficial fechada y aplica continuidad acotada por la siguiente fecha valor oficial verificada. **Comprobación pública posterior: 21/21 PASS**, con vista previa de existencias de solo lectura y cuatro métodos disponibles en ese instante. La nota PDF de una venta real existente aprobó **5/5 controles** por HTTPS, incluyendo Carta/A4; no se crearon operaciones comerciales. **Respaldo posterior aprobado el 7 de noviembre de 2026 a las 12:06:41 UTC:** copia externa verificada, recuperación desde esa copia, limpieza del entorno de restauración y copia cifrada en el VPS comprobadas. [Auditoría](docs/auditoria-v4-8.md), [matriz](docs/matriz-aceptacion-v4-8.md) y [evidencia](docs/verificacion-v4-8.json).

El repositorio público está autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). La versión anterior V4.7, código `82cd5ab579fbbc50cf852774aca47847cc388fa5` del [PR #8](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/8), queda como antecedente; la producción actual usa V4.8. Un commit documental posterior no cambia por sí solo el código desplegado. Las pruebas físicas de tablet/impresora se registran por separado y no impiden el acceso de los socios a la operación publicada.

## Uso diario

1. **Recibir mercancía (`/recepciones`)**: elegir producto y empaque, indicar cantidades y revisar. Proveedor y documento externo son opcionales; el sistema asigna un número interno. No se solicitan costos ni precios de venta.
2. **Vender (`/ventas/nueva`)**: elegir cliente, producto, presentación y cantidad; escribir el precio positivo por unidad. No hace falta una lista de precios. Elegir contado o crédito y el acuerdo de cobro; revisar antes de confirmar.
3. **Cobrar (`/cobranza`)**: aplicar el abono a los comprobantes elegidos. El precio y el acuerdo originales se conservan. El crédito puede comenzar sin abono; fecha acordada y recordatorio se gestionan por separado.
4. **Entregar o imprimir**: abrir la nota de entrega desde la venta confirmada. Ver, descargar o reimprimir no vuelve a vender ni descuenta existencias. El comprobante de venta y el recibo de abono son documentos separados.

[Manual de la versión publicada](docs/manual-socios-v4-8.md) · [Guía de impresión HP](docs/guia-impresion-hp-v4-7.md) · [Guía HP de una hoja en PDF](docs/guia-impresion-hp-v4-7.pdf).

## Cobros y tasas

La interfaz presenta cuatro métodos: **Efectivo USD**, **Bolívares a tasa BCV**, **USDT** y **Bolívares a tasa USDT compra**. El acuerdo se fija al vender, independientemente del precio manual y de contado/crédito:

- Acuerdo **divisa**: los bolívares se convierten con la cotización USDT de compra verificada.
- Acuerdo **BCV**: los bolívares se convierten con la tasa oficial BCV verificada.
- USD y USDT cancelan el saldo USD **1:1**. La equivalencia de USDT en bolívares es informativa y opcional; su ausencia no bloquea un cobro USDT.

**Para cobrar una venta nueva a BCV:** elige primero **Acuerdo de cobro → Regular / BCV** y después **Método de cobro → Bolívares a tasa BCV**. Con el acuerdo vacío o promocional, BCV aparece deshabilitado.

Los métodos incompatibles con el acuerdo aparecen deshabilitados. Cada cobro en bolívares requiere una cotización verificada y vigente al confirmar; una tasa futura no se adelanta y una fuente ausente o vencida bloquea ese cobro. El abono no recalcula el precio pactado. La referencia Binance es una cotización general de compra, no una oferta garantizada ni un cambio ejecutado por la aplicación.

**Última BCV oficial:** se muestra con su fecha valor original, incluso cuando solo puede usarse como referencia histórica. Esa referencia no habilita cobros en bolívares. La continuidad hasta una próxima fecha oficial verificada es una política acotada de la aplicación; no se atribuye al BCV una regla de caducidad de fin de semana.

Todos los PDF son **documentos comerciales no fiscales**, no facturas fiscales SENIAT. No hay envíos automáticos a clientes; WhatsApp es manual y push requiere consentimiento de la tablet. La impresión física de documentos de la aplicación en HP y el uso en una tablet real siguen pendientes de comprobación humana.

## Catálogo e inventario

- **Catálogo (`/catalogo`)**: opciones habituales y altas manuales; variedad/calibre cuando corresponde, línea comercial y presentaciones confirmadas. Ver opciones no crea existencias ni precios.
- **Inventario (`/inventario`)**: cajas selladas, fracciones, movimientos, ajustes con motivo y reversas admisibles. La venta asigna lotes automáticamente por FIFO, sin contar dos veces una caja abierta y su contenido.
- **Clientes (`/clientes`)**: búsqueda por nombre, teléfono o RIF, historial y saldos por comprobante.
- **Proveedores (`/proveedores`)**: altas, cambios y desactivación conservando historia; no son obligatorios para recibir.
- **Demo local o de QA (`/demo`)**: recorrido sintético separado de la operación privada, sin guardar operaciones reales; deshabilitado en producción.

El calibre es una etiqueta de tamaño, no una cantidad de frutas. Manzana tradicional con blíster usa cuatro para calibre menor o igual a 100, y cinco por encima; las peras tienen su lista explícita. Kiwi y granel admiten mitades comerciales; uva solo cajas. Los alimentos necesitan una unidad comercial explícita. Una presentación desconocida permanece pendiente; no se inventan piezas, pesos ni existencias.

Las nuevas recepciones no recogen costos: el valor desconocido permanece NULL y permite las operaciones físicas. Los costos históricos conocidos se conservan internamente; la operación actual no muestra costo, margen ni utilidad. Las nuevas ventas usan el precio escrito para esa venta y no crean ni modifican listas históricas. Véanse [reglas del negocio](docs/domain-rules.md) y [modelo de inventario](docs/inventory-model.md).

## Acceso y datos

El propietario eligió un único acceso privado compartido por los dueños, sin registro público. Las sesiones son revocables: ocho horas con 30 minutos de inactividad, o 30 días al marcar **Mantener sesión activa**. Cookie `HttpOnly`, `SameSite=Strict` y `Secure` en staging/producción. Cerrar sesión o restablecer la contraseña revoca el acceso. El proxy limita rutas y valida el origen de las mutaciones.

El operador invita mediante `npx tsx scripts/create-user.ts --file <archivo-privado>` siguiendo [autenticación](docs/authentication.md). El archivo contiene `username`, `displayName` y `password`; nunca pasar contraseñas por argumentos. `--reset` invalida sesiones anteriores. Staging no crea usuarios automáticamente.

`.env`, `.local`, invitaciones, respaldos y credenciales quedan fuera de Git. Staging tiene base exclusiva y operaciones DEMO marcadas por el servidor. La PWA no almacena respuestas operativas ni confirma ventas sin conexión. Los intentos pendientes de recepción, venta o abono conservan localmente su identificación y contenido para recuperar exactamente la misma operación; se reintentan de forma explícita, sin volver a registrarla como nueva.

## Abrir localmente

Requiere Node.js 24.x y npm; el runtime publicado usa Node.js 24.22.1. En una terminal dentro del repositorio:

```powershell
npm ci
npm run dev
```

Abre **http://127.0.0.1:3100**. `/demo` no requiere cuenta; el acceso privado local está en `.local/auth-local.json`. No compartas ni versiones ese archivo. El iniciador genera secretos si faltan, inicia PostgreSQL exclusivo en `127.0.0.1:55432`, migra, prepara datos locales y crea el usuario local. No instala servicios Windows. `Ctrl+C` detiene los procesos y conserva `.local/postgres`.

También existe `INICIAR.ps1`; si está bloqueado usa `npm run dev`, sin cambiar políticas globales. Dependencias, base, navegador y capturas necesitan espacio libre adicional; los ensayos con bases nuevas conservan su evidencia.

## Verificación

El runtime publicado V4.8 aprobó **419 unitarias**, tipos/builds, **34 dirigidos**, **149 E2E en una ejecución**, **13 casos de producción aislada** y migraciones. Staging aprobó **29 comprobaciones**. Los intentos anteriores y sus correcciones se conservan en la [evidencia V4.8](docs/verificacion-v4-8.json); no se presentan como ejecuciones completas aprobadas. La comprobación pública posterior aprobó 21/21 controles y la vista previa de existencias de solo lectura; las lecturas del PDF real aprobaron 5/5. Eso no acredita geometría del PDF ni impresión en papel. El respaldo posterior aprobó copia externa, recuperación aislada y copia cifrada en el VPS a las 12:06:41 UTC del 7 de noviembre de 2026.

```powershell
npm run check
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npx playwright install chromium
npm run test:e2e -- --fresh-db
```

`check` ejecuta tipos, unitarios y build. Cierra el iniciador local antes de E2E: la suite administra sus servicios y utiliza la base de pruebas `manzanas_maracay_test`, nunca el VPS. `--fresh-db` crea un clúster local exclusivo dentro de `.local/e2e-fresh`, conserva el anterior y registra su detención. `npm run test:e2e` sin esa opción reutiliza el clúster local de pruebas. `npm run db:stop` detiene únicamente la base identificada del proyecto.

Hay **16 migraciones**, `0000`–`0015`; no reescribir las aplicadas ni usar `db push`. V4.8 conserva ese esquema. `scripts/verify-phase4-migrations.ts` usa bases temporales propias locales. `node scripts/test-production.mjs` ensaya producción con HTTPS local, autorización sintética de apertura y otra base temporal; jamás se dirige al VPS. El ensayo elimina su base marcada y detiene sus procesos al terminar.

## Organización

```text
apps/web/          Next.js, demo, operación privada y proxy
apps/api/          NestJS, sesiones, inventario, comercio, tasas y push
packages/domain/   Reglas, precisión decimal y contratos
packages/database/ Drizzle y migraciones PostgreSQL
scripts/           Arranque, pruebas, migraciones, usuarios y staging
.agents/skills/    Selección auditada y skill de integridad
```

`compose.yaml` ofrece desarrollo con volumen y puerto propios; no ejecutarlo junto a PostgreSQL portable. Esa alternativa requiere Docker y su propia validación local. Los despliegues de producción y staging tienen recursos exclusivos y evidencia independiente; no se ejecutan pruebas sintéticas sobre datos reales.

## Documentación actual

- [Continuar en otro chat](docs/continuar-en-chatgpt.md)
- Antecedente V4.7: [auditoría](docs/auditoria-v4-7.md), [matriz](docs/matriz-aceptacion-v4-7.md), [verificación](docs/verificacion-v4-7.json) y [promoción](docs/promocion-v4-7.md)
- V4.8 publicada: [auditoría](docs/auditoria-v4-8.md), [matriz](docs/matriz-aceptacion-v4-8.md), [verificación](docs/verificacion-v4-8.json) y [promoción](docs/promocion-v4-8.md)
- [Reglas](docs/domain-rules.md), [inventario](docs/inventory-model.md), [arquitectura](docs/architecture.md) y [sesiones](docs/authentication.md)
- [Diseño](DESIGN.md), [marca](docs/brand-assets.md), [skills](docs/skills.md) y [push](docs/push-cobranza.md)

## Historia y procedimientos anteriores

Estos documentos conservan decisiones y evidencias de cada fecha; sus estados antiguos no sustituyen el estado publicado indicado arriba.

- [Fase 1](docs/entrega-fase-1.md), [fase 2](docs/entrega-fase-2.md), [fase 3](docs/entrega-fase-3.md) y [seguridad de fase 3](docs/revision-seguridad-fase-3.md)
- Fase 4: [plan](docs/plan-fase-4.md), [entrega](docs/entrega-fase-4-produccion.md), [pruebas locales](docs/verificacion-fase4-local.json), [verificación remota](docs/verificacion-produccion-fase4.json) y [migraciones](docs/verificacion-migraciones-fase4.json)
- [Operación real](docs/operacion-real.md), [despliegue](docs/despliegue-produccion.md), [backup](docs/backup-produccion.md), [pendientes](docs/pendientes-comerciales.md), [staging](docs/staging.md), [infraestructura](docs/infrastructure.md) y [BCV histórico](docs/bcv.md)
- [Catálogo y tasas V4](docs/catalogo-tasas-v4.md), [continuación V4.2](docs/referencias/brief-recepcion-rapida-v4-2.txt) y [operación simple V4.5](docs/operacion-simple-v4-5.md)
- PR anteriores conservados: [#1](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1), [#2](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2), [#3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/3) y [#5](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/5). La primera producción de fase 4 fue `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`; fue reemplazada por V4.7 y posteriormente por V4.8.

El mantenimiento propio conserva respaldo/restauración y monitor. No automatiza la copia externa, avisos a terceros ni eliminación de respaldos. Los servicios web exclusivos son `mm-staging-web` y `mm-production-web`; se conserva documentada la incidencia histórica del alias genérico `web`.
