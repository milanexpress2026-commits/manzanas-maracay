# Manzanas Maracay

**V4.16 en preparaciÃ³n:** carga inicial de ventas desde el servidor, paginaciÃ³n y menos descargas al navegar. ProducciÃ³n todavÃ­a usa V4.15. [Evidencia y lÃ­mites](docs/navegacion-tablet-v4-16.md) Â· [PR #17](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/17).

**V4.15 publicada:** notas mÃ¡s ligeras y recepciÃ³n mÃ¡s rÃ¡pida, con catÃ¡logo Ãºnico y menos descargas al navegar. Inventario, ventas, acceso y tablet conservados; documentos reales y respaldo restaurado verificados. Cerrar y abrir la app instalada para cargar la interfaz nueva. [Entrar al sistema](https://manzanas.ganamosclub.net) Â· [Cambios y mediciones](docs/rendimiento-v4-15.md) Â· [PR #16](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/16).

**Antecedente V4.14:** la nota incluye la direcciÃ³n del local y, para ventas pactadas a BCV, el total en bolÃ­vares con la tasa del dÃ­a de la venta. Se puede reimprimir la venta existente. Datos conservados, Carta/A4 y respaldo restaurado verificados. [Entrar al sistema](https://manzanas.ganamosclub.net/ventas) Â· [Cambios](docs/nota-direccion-bcv-v4-14.md) Â· [PR #15](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/15).

AplicaciÃ³n privada para recepciÃ³n de frutas, inventario, ventas, clientes, crÃ©dito, abonos y notas de entrega.

**Antecedente V4.13:** las notas se abren mediante su enlace privado en Android y desde el Ã­cono instalado. Acceso, documentos y respaldo restaurado verificados; datos conservados. Cerrar por completo la aplicaciÃ³n y volver a abrirla desde el Ã­cono para cargar la nueva interfaz. [Entrar al sistema](https://manzanas.ganamosclub.net/ventas) Â· [Cambios y verificaciones](docs/notas-android-v4-13.md) Â· [PR #14](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/14).

**Antecedente V4.12:** venta directa de media caja para productos con blÃ­steres y granel/kiwi, tambiÃ©n con el catÃ¡logo ya cargado. No requiere contar frutas ni volver a ingresar mercancÃ­a. Se conservan recepciones y existencias. [Entrar al sistema](https://manzanas.ganamosclub.net/ventas/nueva). Runtime `22b8f6d7a24358c379a133b0435e79de7ec80d16`, [PR #13](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/13). [Cambios](docs/medias-comerciales-v4-12.md) Â· [Verificaciones y respaldo restaurado](docs/verificacion-v4-12.json). Recargar la aplicaciÃ³n para cargar la nueva interfaz.

- Antecedente V4.11 publicado y verificado: runtime `39c5461090debb0b9b17df3105b27170a590a419`, rama `fix/calibre-100-emisor-v4-11`, PR #12. AprobaciÃ³n expresa del propietario recibida y aplicada. 444 unitarias, 154/154 E2E, 13 casos de producciÃ³n aislada, 29 controles de staging y 21 de acceso real PASS. Todas las filas conservadas durante el cambio de cÃ³digo; despuÃ©s se corrigiÃ³ un empaque mediante PATCH auditado, con existencias y otras configuraciones intactas. Las cuatro variedades tradicionales calibre 100 ofrecen cinco blÃ­steres. Nota simplificada con emisor/RIF privados, contado/crÃ©dito, tasas y firmas. PDF comprobado en memoria con la imagen instalada, sin registrar venta; interfaz mÃ³vil/tablet verificada. 16 migraciones sin DDL, acceso/tablet conservados, recolector reanudado y cuatro mÃ©todos disponibles al comprobar. Respaldo posterior cifrado PC/VPS y restaurado PASS `2026-11-10T04:04:51.710248+00:00`. **No repetir la publicaciÃ³n ni ningÃºn vaciado: los socios ya registraron mercancÃ­a.** Ver docs/calibre-emisor-v4-11.md y docs/verificacion-v4-11.json.

- Antecedente V4.10 publicado y verificado: runtime `642ffae84efd23c14871acf2df7a96fb2e62209e`, rama `fix/auditoria-logica-v4-10`, PR #11. El propietario autorizÃ³ expresamente esta publicaciÃ³n; terminÃ³ el 9/11/2026, hora Venezuela. 436 unitarias, 154/154 E2E, producciÃ³n aislada/migraciones, staging 29 y acceso real 21 PASS. Todas las filas conservadas; acceso/tablet intactos, 16 migraciones sin DDL, DNS/Caddy sin cambios. BCV/USDT disponibles al comprobar. Respaldo posterior cifrado externo/restaurado PASS 2026-11-10T02:07:12.485619+00:00. Hubo un corte SSH tras el respaldo de la pausa y antes de activar; se conservÃ³ la evidencia y se completÃ³ la recuperaciÃ³n hacia adelante tras comprobar datos, servicios y configuraciÃ³n exactos. **No repetir ningÃºn vaciado: los socios ya registraron mercancÃ­a nueva.** Los pÃ¡rrafos siguientes son antecedentes; consultar docs/auditoria-logica-v4-10.md y docs/verificacion-v4-10.json.

**Antecedente V4.9 publicado y verificado**, runtime `e4edd2385614c41673209b20dd431df95444b10a`, con 16 migraciones conservadas. [Entrar a Manzanas Maracay](https://manzanas.ganamosclub.net/login). Las ventas toman automÃ¡ticamente la hora de Venezuela al finalizar. CatÃ¡logo reÃºne fruta, variedad, calibre y empaque en un formulario, con alta de calibre desde el producto y transiciones breves entre menÃºs.

El reinicio operativo autorizado dejÃ³ mercancÃ­a, ventas, abonos y saldos en cero, conservando catÃ¡logo, clientes, proveedores, acceso, configuraciÃ³n y tablet. Los socios deben iniciar sesiÃ³n otra vez y comenzar por Recepciones. No repetir el reinicio: la base puede contener operaciones nuevas desde esta publicaciÃ³n.

ValidaciÃ³n: 421 unitarias, tipos/builds, 153 casos E2E cubiertos entre una corrida de 152/153 y dos repeticiones aprobadas del caso de volumen, 13 pruebas de producciÃ³n aislada, migraciones, 29 controles comerciales de staging y 21 controles reales. Respaldo posterior cifrado y restaurado. [Cambios y lÃ­mites de la evidencia](docs/operacion-diaria-v4-9.md) Â· [VerificaciÃ³n](docs/verificacion-v4-9.json) Â· [PR #10](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/10).

V4.8 y versiones anteriores son antecedentes conservados en su documentaciÃ³n y en Git. El repositorio pÃºblico no contiene accesos ni datos privados. Un commit documental posterior no cambia el runtime desplegado.

## Uso diario

1. **Recibir mercancÃ­a (`/recepciones`)**: elegir producto y empaque, indicar cantidades y revisar. Proveedor y documento externo son opcionales; el sistema asigna un nÃºmero interno. No se solicitan costos ni precios de venta.
2. **Vender (`/ventas/nueva`)**: elegir cliente, producto, presentaciÃ³n y cantidad; escribir el precio positivo por unidad. No hace falta una lista de precios. Elegir contado o crÃ©dito y el acuerdo de cobro; revisar antes de confirmar.
3. **Cobrar (`/cobranza`)**: aplicar el abono a los comprobantes elegidos. El precio y el acuerdo originales se conservan. El crÃ©dito puede comenzar sin abono; fecha acordada y recordatorio se gestionan por separado.
4. **Entregar o imprimir**: abrir la nota de entrega desde la venta confirmada. Ver, descargar o reimprimir no vuelve a vender ni descuenta existencias. El comprobante de venta y el recibo de abono son documentos separados.

[Manual de la versiÃ³n publicada](docs/manual-socios-v4-9.md) Â· [GuÃ­a de impresiÃ³n HP](docs/guia-impresion-hp-v4-7.md) Â· [GuÃ­a HP de una hoja en PDF](docs/guia-impresion-hp-v4-7.pdf).

## Cobros y tasas

La interfaz presenta cuatro mÃ©todos: **Efectivo USD**, **BolÃ­vares a tasa BCV**, **USDT** y **BolÃ­vares a tasa USDT compra**. El acuerdo se fija al vender, independientemente del precio manual y de contado/crÃ©dito:

- Acuerdo **divisa**: los bolÃ­vares se convierten con la cotizaciÃ³n USDT de compra verificada.
- Acuerdo **BCV**: los bolÃ­vares se convierten con la tasa oficial BCV verificada.
- USD y USDT cancelan el saldo USD **1:1**. La equivalencia de USDT en bolÃ­vares es informativa y opcional; su ausencia no bloquea un cobro USDT.

**Para cobrar una venta nueva a BCV:** elige primero **Acuerdo de cobro â†’ Regular / BCV** y despuÃ©s **MÃ©todo de cobro â†’ BolÃ­vares a tasa BCV**. Con el acuerdo vacÃ­o o promocional, BCV aparece deshabilitado.

Los mÃ©todos incompatibles con el acuerdo aparecen deshabilitados. Cada cobro en bolÃ­vares requiere una cotizaciÃ³n verificada y vigente al confirmar; una tasa futura no se adelanta y una fuente ausente o vencida bloquea ese cobro. El abono no recalcula el precio pactado. La referencia Binance es una cotizaciÃ³n general de compra, no una oferta garantizada ni un cambio ejecutado por la aplicaciÃ³n.

**Ãšltima BCV oficial:** se muestra con su fecha valor original, incluso cuando solo puede usarse como referencia histÃ³rica. Esa referencia no habilita cobros en bolÃ­vares. La continuidad hasta una prÃ³xima fecha oficial verificada es una polÃ­tica acotada de la aplicaciÃ³n; no se atribuye al BCV una regla de caducidad de fin de semana.

Todos los PDF son **documentos comerciales no fiscales**, no facturas fiscales SENIAT. No hay envÃ­os automÃ¡ticos a clientes; WhatsApp es manual y push requiere consentimiento de la tablet. La impresiÃ³n fÃ­sica de documentos de la aplicaciÃ³n en HP y el uso en una tablet real siguen pendientes de comprobaciÃ³n humana.

## CatÃ¡logo e inventario

- **CatÃ¡logo (`/catalogo`)**: opciones habituales y altas manuales; variedad/calibre cuando corresponde, lÃ­nea comercial y presentaciones confirmadas. Ver opciones no crea existencias ni precios.
- **Inventario (`/inventario`)**: cajas selladas, fracciones, movimientos, ajustes con motivo y reversas admisibles. La venta asigna lotes automÃ¡ticamente por FIFO, sin contar dos veces una caja abierta y su contenido.
- **Clientes (`/clientes`)**: bÃºsqueda por nombre, telÃ©fono o RIF, historial y saldos por comprobante.
- **Proveedores (`/proveedores`)**: altas, cambios y desactivaciÃ³n conservando historia; no son obligatorios para recibir.
- **Demo local o de QA (`/demo`)**: recorrido sintÃ©tico separado de la operaciÃ³n privada, sin guardar operaciones reales; deshabilitado en producciÃ³n.

El calibre es una etiqueta de tamaÃ±o, no una cantidad de frutas. Manzana tradicional con blÃ­ster usa cuatro para calibre menor o igual a 100 y cinco por encima, con la correcciÃ³n V4.11 de cinco tambiÃ©n para Roja normal/Roja, Verde, Amarilla y Gala calibre 100. Pink Lady/Lady 100 conservan cuatro; las peras tienen su lista explÃ­cita. Las configuraciones y lotes histÃ³ricos mantienen su empaque. Kiwi y granel admiten mitades comerciales; uva solo cajas. Los alimentos necesitan una unidad comercial explÃ­cita. Una presentaciÃ³n desconocida permanece pendiente; no se inventan piezas, pesos ni existencias.

Las nuevas recepciones no recogen costos: el valor desconocido permanece NULL y permite las operaciones fÃ­sicas. Los costos histÃ³ricos conocidos se conservan internamente; la operaciÃ³n actual no muestra costo, margen ni utilidad. Las nuevas ventas usan el precio escrito para esa venta y no crean ni modifican listas histÃ³ricas. VÃ©anse [reglas del negocio](docs/domain-rules.md) y [modelo de inventario](docs/inventory-model.md).

## Acceso y datos

El propietario eligiÃ³ un Ãºnico acceso privado compartido por los dueÃ±os, sin registro pÃºblico. Las sesiones son revocables: ocho horas con 30 minutos de inactividad, o 30 dÃ­as al marcar **Mantener sesiÃ³n activa**. Cookie `HttpOnly`, `SameSite=Strict` y `Secure` en staging/producciÃ³n. Cerrar sesiÃ³n o restablecer la contraseÃ±a revoca el acceso. El proxy limita rutas y valida el origen de las mutaciones.

El operador invita mediante `npx tsx scripts/create-user.ts --file <archivo-privado>` siguiendo [autenticaciÃ³n](docs/authentication.md). El archivo contiene `username`, `displayName` y `password`; nunca pasar contraseÃ±as por argumentos. `--reset` invalida sesiones anteriores. Staging no crea usuarios automÃ¡ticamente.

`.env`, `.local`, invitaciones, respaldos y credenciales quedan fuera de Git. Staging tiene base exclusiva y operaciones DEMO marcadas por el servidor. La PWA no almacena respuestas operativas ni confirma ventas sin conexiÃ³n. Los intentos pendientes de recepciÃ³n, venta o abono conservan localmente su identificaciÃ³n y contenido para recuperar exactamente la misma operaciÃ³n; se reintentan de forma explÃ­cita, sin volver a registrarla como nueva.

## Abrir localmente

Requiere Node.js 24.x y npm; el runtime publicado usa Node.js 24.22.1. En una terminal dentro del repositorio:

```powershell
npm ci
npm run dev
```

Abre **http://127.0.0.1:3100**. `/demo` no requiere cuenta; el acceso privado local estÃ¡ en `.local/auth-local.json`. No compartas ni versiones ese archivo. El iniciador genera secretos si faltan, inicia PostgreSQL exclusivo en `127.0.0.1:55432`, migra, prepara datos locales y crea el usuario local. No instala servicios Windows. `Ctrl+C` detiene los procesos y conserva `.local/postgres`.

TambiÃ©n existe `INICIAR.ps1`; si estÃ¡ bloqueado usa `npm run dev`, sin cambiar polÃ­ticas globales. Dependencias, base, navegador y capturas necesitan espacio libre adicional; los ensayos con bases nuevas conservan su evidencia.

## VerificaciÃ³n

El runtime publicado V4.8 aprobÃ³ **419 unitarias**, tipos/builds, **34 dirigidos**, **149 E2E en una ejecuciÃ³n**, **13 casos de producciÃ³n aislada** y migraciones. Staging aprobÃ³ **29 comprobaciones**. Los intentos anteriores y sus correcciones se conservan en la [evidencia V4.8](docs/verificacion-v4-8.json); no se presentan como ejecuciones completas aprobadas. La comprobaciÃ³n pÃºblica posterior aprobÃ³ 21/21 controles y la vista previa de existencias de solo lectura; las lecturas del PDF real aprobaron 5/5. Eso no acredita geometrÃ­a del PDF ni impresiÃ³n en papel. El respaldo posterior aprobÃ³ copia externa, recuperaciÃ³n aislada y copia cifrada en el VPS a las 12:06:41 UTC del 7 de noviembre de 2026.

```powershell
npm run check
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npx playwright install chromium
npm run test:e2e -- --fresh-db
```

`check` ejecuta tipos, unitarios y build. Cierra el iniciador local antes de E2E: la suite administra sus servicios y utiliza la base de pruebas `manzanas_maracay_test`, nunca el VPS. `--fresh-db` crea un clÃºster local exclusivo dentro de `.local/e2e-fresh`, conserva el anterior y registra su detenciÃ³n. `npm run test:e2e` sin esa opciÃ³n reutiliza el clÃºster local de pruebas. `npm run db:stop` detiene Ãºnicamente la base identificada del proyecto.

Hay **16 migraciones**, `0000`â€“`0015`; no reescribir las aplicadas ni usar `db push`. V4.8 conserva ese esquema. `scripts/verify-phase4-migrations.ts` usa bases temporales propias locales. `node scripts/test-production.mjs` ensaya producciÃ³n con HTTPS local, autorizaciÃ³n sintÃ©tica de apertura y otra base temporal; jamÃ¡s se dirige al VPS. El ensayo elimina su base marcada y detiene sus procesos al terminar.

## OrganizaciÃ³n

```text
apps/web/          Next.js, demo, operaciÃ³n privada y proxy
apps/api/          NestJS, sesiones, inventario, comercio, tasas y push
packages/domain/   Reglas, precisiÃ³n decimal y contratos
packages/database/ Drizzle y migraciones PostgreSQL
scripts/           Arranque, pruebas, migraciones, usuarios y staging
.agents/skills/    SelecciÃ³n auditada y skill de integridad
```

`compose.yaml` ofrece desarrollo con volumen y puerto propios; no ejecutarlo junto a PostgreSQL portable. Esa alternativa requiere Docker y su propia validaciÃ³n local. Los despliegues de producciÃ³n y staging tienen recursos exclusivos y evidencia independiente; no se ejecutan pruebas sintÃ©ticas sobre datos reales.

## DocumentaciÃ³n actual

- [Continuar en otro chat](docs/continuar-en-chatgpt.md)
- Antecedente V4.7: [auditorÃ­a](docs/auditoria-v4-7.md), [matriz](docs/matriz-aceptacion-v4-7.md), [verificaciÃ³n](docs/verificacion-v4-7.json) y [promociÃ³n](docs/promocion-v4-7.md)
- V4.8 publicada: [auditorÃ­a](docs/auditoria-v4-8.md), [matriz](docs/matriz-aceptacion-v4-8.md), [verificaciÃ³n](docs/verificacion-v4-8.json) y [promociÃ³n](docs/promocion-v4-8.md)
- [Reglas](docs/domain-rules.md), [inventario](docs/inventory-model.md), [arquitectura](docs/architecture.md) y [sesiones](docs/authentication.md)
- [DiseÃ±o](DESIGN.md), [marca](docs/brand-assets.md), [skills](docs/skills.md) y [push](docs/push-cobranza.md)

## Historia y procedimientos anteriores

Estos documentos conservan decisiones y evidencias de cada fecha; sus estados antiguos no sustituyen el estado publicado indicado arriba.

- [Fase 1](docs/entrega-fase-1.md), [fase 2](docs/entrega-fase-2.md), [fase 3](docs/entrega-fase-3.md) y [seguridad de fase 3](docs/revision-seguridad-fase-3.md)
- Fase 4: [plan](docs/plan-fase-4.md), [entrega](docs/entrega-fase-4-produccion.md), [pruebas locales](docs/verificacion-fase4-local.json), [verificaciÃ³n remota](docs/verificacion-produccion-fase4.json) y [migraciones](docs/verificacion-migraciones-fase4.json)
- [OperaciÃ³n real](docs/operacion-real.md), [despliegue](docs/despliegue-produccion.md), [backup](docs/backup-produccion.md), [pendientes](docs/pendientes-comerciales.md), [staging](docs/staging.md), [infraestructura](docs/infrastructure.md) y [BCV histÃ³rico](docs/bcv.md)
- [CatÃ¡logo y tasas V4](docs/catalogo-tasas-v4.md), [continuaciÃ³n V4.2](docs/referencias/brief-recepcion-rapida-v4-2.txt) y [operaciÃ³n simple V4.5](docs/operacion-simple-v4-5.md)
- PR anteriores conservados: [#1](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1), [#2](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2), [#3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/3) y [#5](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/5). La primera producciÃ³n de fase 4 fue `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`; fue reemplazada por V4.7 y posteriormente por V4.8.

El mantenimiento propio conserva respaldo/restauraciÃ³n y monitor. No automatiza la copia externa, avisos a terceros ni eliminaciÃ³n de respaldos. Los servicios web exclusivos son `mm-staging-web` y `mm-production-web`; se conserva documentada la incidencia histÃ³rica del alias genÃ©rico `web`.
