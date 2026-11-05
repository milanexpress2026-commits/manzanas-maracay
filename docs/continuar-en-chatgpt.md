# Continuar la revisión de Manzanas Maracay

Repositorio público autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama de trabajo de Fase 3: `phase-3/comercial-demo`, basada en `phase-2/inventario-staging` (`f9b532b75c1ffce668571dc7db0ed20b5a52c36f`). Este contexto no incluye credenciales.

**Al corte del 4 de noviembre de 2026, la demo pública temporal está activa como `demo-db16c5745423` y el código de Fase 3 está verificado/publicado; API y esquema comerciales completos siguen pendientes de despliegue.** Código principal `28110ef0f0bf1079ffa60b3f60545c2bfd194290`, [PR #2 en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2). Este documento distingue rama, componente publicado y prueba ejecutada.

## Prompt para copiar

```text
Revisa Manzanas Maracay, aplicación para una distribuidora venezolana de frutas importadas. Explica tus conclusiones en español claro y distingue código implementado, pruebas ejecutadas y release desplegada.

Repositorio: https://github.com/milanexpress2026-commits/manzanas-maracay
Rama de trabajo Fase 3: phase-3/comercial-demo
Base: f9b532b75c1ffce668571dc7db0ed20b5a52c36f, de phase-2/inventario-staging
Staging: https://manzanas.ganamosclub.net
Web pública activa: demo-db16c5745423, commit db16c574542347cc15c89498184873b9e5953d84, saludable 23:33:21 UTC. API/esquema conservan phase2-7ae1d75. Código comercial publicado: 28110ef0f0bf1079ffa60b3f60545c2bfd194290, PR #2 en borrador contra phase-2/inventario-staging, sin merge.
PR previo #1 que debe preservarse: https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1

El propietario autorizó «Ejecutar la fase 3 y actualizar staging». La demo sintética sin contraseña ya está activa; acceso interno permanece protegido. Falta desplegar la API/esquema comerciales completos. No volver a pedir autorización genérica ni confundir la web temporal con toda la fase. Verifica versión efectiva antes de actuar; no se autorizaron merge ni producción.

Lee primero AGENTS.md, README.md, PRODUCT.md, DESIGN.md, docs/domain-rules.md, docs/plan-fase-3.md, docs/architecture.md y docs/inventory-model.md. Para evidencia actual consulta docs/entrega-fase-3.md, docs/verificacion-migraciones-fase3.json, docs/pdf-qa-fase-3.md, docs/bcv.md, docs/push-cobranza.md, docs/revision-seguridad-fase-3.md y docs/skills.md. Para operación remota lee docs/staging.md e infrastructure.md. Las entregas de fases 1/2 conservan evidencia histórica, no acreditan Fase 3.

Implementación actual: catálogo con variedad/calibre opcionales y capacidades genéricas de empaque; recepción multilínea con precios explícitos; costo histórico y FIFO; clientes, ventas negociadas, crédito sin pago inicial, abonos repartidos por comprobante, recibos PDF, cobranza y fechas independientes; WhatsApp manual y push opt-in de una tablet; demo sintética aislada y UI responsive con movimiento reducido.

Next.js es interfaz/proxy; NestJS es autoridad comercial; PostgreSQL conserva un único ledger físico y de costo. Venta, líneas, asignaciones por lote/recipiente, salida de stock, abono inicial, auditoría y respuesta idempotente comparten PoolClient y commit. No crees un segundo stock ni hagas red externa dentro de la transacción. Cambios confirmados son inmutables; reversas y anulaciones admisibles son compensaciones. Anular exige ausencia de abonos activos y no tener dependencias posteriores por lote.

Conserva estas reglas: calibre nunca cuenta frutas; recipiente abierto no se suma a sus hijos; null no es cero; no hay ventas por pieza. Granel y kiwi pueden fraccionarse en medias comerciales sin piezas; kiwi conserva 10 kg/caja y 5 kg/media por configuración. Uva solo caja. Pera puede tener empaque pendiente y bloquea operaciones dependientes de datos ausentes. No equipares Lady con Pink Lady ni inventes blíster por variedad/calibre o reglas de mandarina. Caja+media son dos presentaciones enteras, no 1,5 cajas cerradas. Las medias contadas siguen exigiendo conteo físico coherente.

Dinero y tasas usan NUMERIC/Decimal. Costo a cuatro decimales, residuo en última fracción, precios de venta independientes del costo. FIFO: comprar 10 cajas a 25 USD + 10 a 27 USD y vender 12 a 40 USD da costo 304, ingreso 480 y bruto 176. No incluye flete ni otros gastos. Precio pactado no cambia lista general. Los PDFs llevan logo original y numeración comercial; no son facturas fiscales SENIAT ni exponen costos internos al cliente.

Crédito puede no tener fecha pactada ni pago inicial. Cero significa ausencia de abono, no asiento cero. El operador elige comprobante y reparte montos; no se distribuyen excedentes automáticamente. Transacciones, restricciones SQL e idempotencia impiden sobrepago y doble consumo. Deuda histórica en USD no cambia con tasas posteriores. Fecha pactada y recordatorio interno son campos/eventos distintos, en America/Caracas.

BCV real continúa pendiente: el sitio oficial no pudo verificarse con TLS estricto; no se omitió TLS ni se usó fuente paralela. El proveedor lee caché oficial histórica y rechaza ausente/duplicada/futura/vencida/inconsistente. VES permanece bloqueado sin registro válido; USD continúa. Nunca presentar fixture de tests como tasa real ni asumir API oficial. Un procedimiento controlado requiere decisión específica antes de activarlo.

WhatsApp abre el teléfono internacional guardado con saldo actual; el operador envía. Sin envíos autónomos ni Meta Cloud API. Se crearon y validaron tres archivos VAPID privados, sin arrancar servicios, suscribir dispositivos ni enviar avisos. El opt-in de una tablet Android corporativa, entrega real, perfil WhatsApp y restricciones iOS siguen pendientes. Aceptación del proveedor no acredita entrega física; centro in-app es fallback.

Demo /demo: solo datos sintéticos estáticos, filtros locales, sin API privada ni sesión compartida. La aplicación interna conserva guard global, sesiones revocables, cookies protegidas, control de origen y clave interna del proxy. No abrir GET de clientes, precios, saldos, documentos o cobros a visitantes. Código público no significa datos públicos.

Evidencia final local: baseline de Fase 2 renovado con typecheck/build, 23 unitarias y 32 E2E aprobados. Fase 3: typecheck/build aprobados, 90/90 unitarias en 11 archivos (17,59 s) y 53/53 E2E (4,3 min). Migraciones 0000–0010 fresh/upgrade aprobaron el 2026-11-04 22:54:14–22:54:29 UTC: 16 tablas previas y seis hashes conservados, dos cajas + cuatro blíster, piezas null, costo 84 de 90; ambas bases temporales propias retiradas. Informe 2b09937b4ce6d75ddacd867c. No reescribir migraciones aplicadas ni usar db push.

Se corrigieron errores SQL 42883/42501 y dos desbordes de 390 px; la suite final aprobó 53/53. Incluye diez casos comerciales, permisos, PDF, reintentos de venta/abono/recepción y tasa posterior sin revaluar deuda/recibo. Tres PDFs y ocho páginas fueron inspeccionados. docs/visual-review-fase-3.md registra 30 vistas, 30 auditorías axe aprobadas, comparación antes/después, vídeo real de 17,56 s y cuatro muestras de rendimiento bajo emulación. Tablet física/Safari/push real siguen pendientes.

No ejecutes pruebas contra staging. El script test:e2e administra manzanas_maracay_test en loopback 3200/3201 y PostgreSQL 55432. Coordina servicios si otro agente está verificando. Credenciales locales en .local/auth-local.json son privadas: no imprimirlas ni copiarlas. No expongas .env, tokens, hashes, llaves, respaldos o datos de clientes en Git/chat/capturas.

Staging usa recursos exclusivos, API/DB internas y servicio mm-staging-web. Hubo una incidencia histórica de Fase 2: alias genérico web colisionó con Socios y produjo 502; se corrigió con alias propio y prioridad de gateway −1, y se verificaron Manzanas/Socios/Pedal y sesiones. No reutilices el Compose antiguo ni niegues el incidente. No reiniciar servicios ajenos ni usar prune/down-v. Nuevo DNS/proxy/firewall/red compartida requiere autorización concreta adicional; autorizar demo no amplía esa facultad.

Demo temporal solo web ya activa: demo-db16c5745423, commit db16c574542347cc15c89498184873b9e5953d84, saludable 23:33:21 UTC. Se conservaron API/PG/esquema/proxy/rutas y cinco GET Socios 302/Pedal 200. Navegador externo fresco a las 23:42:14 UTC verificó siete rutas 200, ninguna API privada ni cookie operativa en demo, cuatro denegaciones 401, login interno, cookie Secure y revocación al salir; docs/verificacion-demo-publica.json. La release comercial completa necesita respaldo/restauración y nuevo smoke antes de declarar despliegue terminado.

Faltan copia segura fuera del VPS, revisión fiscal y dispositivos reales para considerar producción. No declararla lista. Conserva logo oficial intacto y skill local manzanas-inventory-integrity, usando docs/domain-rules.md como fuente primaria. Primero identifica problemas verificables y el trabajo pendiente; no propongas otra fase ni supongas autorizaciones sobre proyectos ajenos.
```
