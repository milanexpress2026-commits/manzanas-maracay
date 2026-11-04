# Continuar la revisión de Manzanas Maracay

Repositorio público autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama de trabajo de Fase 3: `phase-3/comercial-demo`, basada en `phase-2/inventario-staging` (`f9b532b75c1ffce668571dc7db0ed20b5a52c36f`). Este contexto no incluye credenciales.

**Al corte del 4 de noviembre de 2026, Fase 3 está implementada y verificada localmente; su despliegue comercial sigue pendiente.** No confundir una rama de trabajo con una release ya desplegada ni asumir que los cambios locales están publicados en GitHub. Consultar el commit visible y la [entrega](entrega-fase-3.md) antes de revisar resultados.

## Prompt para copiar

```text
Revisa Manzanas Maracay, aplicación para una distribuidora venezolana de frutas importadas. Explica tus conclusiones en español claro y distingue código implementado, pruebas ejecutadas y release desplegada.

Repositorio: https://github.com/milanexpress2026-commits/manzanas-maracay
Rama de trabajo Fase 3: phase-3/comercial-demo
Base: f9b532b75c1ffce668571dc7db0ed20b5a52c36f, de phase-2/inventario-staging
Staging: https://manzanas.ganamosclub.net
Última release de staging comprobada al corte: phase2-7ae1d75, commit 7ae1d7504d31623e771fba5015361ae04ca9a4ef
PR previo #1 que debe preservarse: https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1

El propietario autorizó expresamente «Ejecutar la fase 3 y actualizar staging», incluyendo demo pública sintética sin contraseña y acceso interno protegido. No falta esa autorización. QA local está aprobado y falta desplegar la nueva release comercial; no afirmes que la demo pública está activa solo por verla en el código. Verifica rama/commit disponibles; si no puedes leer un archivo o una rama, dilo y no supongas contenido. No se autorizaron merge ni producción.

Lee primero AGENTS.md, README.md, PRODUCT.md, DESIGN.md, docs/domain-rules.md, docs/plan-fase-3.md, docs/architecture.md y docs/inventory-model.md. Para evidencia actual consulta docs/entrega-fase-3.md, docs/verificacion-migraciones-fase3.json, docs/pdf-qa-fase-3.md, docs/bcv.md, docs/push-cobranza.md, docs/revision-seguridad-fase-3.md y docs/skills.md. Para operación remota lee docs/staging.md e infrastructure.md. Las entregas de fases 1/2 conservan evidencia histórica, no acreditan Fase 3.

Implementación actual: catálogo con variedad/calibre opcionales y capacidades genéricas de empaque; recepción multilínea con precios explícitos; costo histórico y FIFO; clientes, ventas negociadas, crédito sin pago inicial, abonos repartidos por comprobante, recibos PDF, cobranza y fechas independientes; WhatsApp manual y push opt-in de una tablet; demo sintética aislada y UI responsive con movimiento reducido.

Next.js es interfaz/proxy; NestJS es autoridad comercial; PostgreSQL conserva un único ledger físico y de costo. Venta, líneas, asignaciones por lote/recipiente, salida de stock, abono inicial, auditoría y respuesta idempotente comparten PoolClient y commit. No crees un segundo stock ni hagas red externa dentro de la transacción. Cambios confirmados son inmutables; reversas y anulaciones admisibles son compensaciones. Anular exige ausencia de abonos activos y no tener dependencias posteriores por lote.

Conserva estas reglas: calibre nunca cuenta frutas; recipiente abierto no se suma a sus hijos; null no es cero; no hay ventas por pieza. Granel y kiwi pueden fraccionarse en medias comerciales sin piezas; kiwi conserva 10 kg/caja y 5 kg/media por configuración. Uva solo caja. Pera puede tener empaque pendiente y bloquea operaciones dependientes de datos ausentes. No equipares Lady con Pink Lady ni inventes blíster por variedad/calibre o reglas de mandarina. Caja+media son dos presentaciones enteras, no 1,5 cajas cerradas. Las medias contadas siguen exigiendo conteo físico coherente.

Dinero y tasas usan NUMERIC/Decimal. Costo a cuatro decimales, residuo en última fracción, precios de venta independientes del costo. FIFO: comprar 10 cajas a 25 USD + 10 a 27 USD y vender 12 a 40 USD da costo 304, ingreso 480 y bruto 176. No incluye flete ni otros gastos. Precio pactado no cambia lista general. Los PDFs llevan logo original y numeración comercial; no son facturas fiscales SENIAT ni exponen costos internos al cliente.

Crédito puede no tener fecha pactada ni pago inicial. Cero significa ausencia de abono, no asiento cero. El operador elige comprobante y reparte montos; no se distribuyen excedentes automáticamente. Transacciones, restricciones SQL e idempotencia impiden sobrepago y doble consumo. Deuda histórica en USD no cambia con tasas posteriores. Fecha pactada y recordatorio interno son campos/eventos distintos, en America/Caracas.

BCV real continúa pendiente: el sitio oficial no pudo verificarse con TLS estricto; no se omitió TLS ni se usó fuente paralela. El proveedor lee caché oficial histórica y rechaza ausente/duplicada/futura/vencida/inconsistente. VES permanece bloqueado sin registro válido; USD continúa. Nunca presentar fixture de tests como tasa real ni asumir API oficial. Un procedimiento controlado requiere decisión específica antes de activarlo.

WhatsApp usa teléfono internacional guardado y saldo recién consultado; abre chat con texto prellenado y el operador envía. No hay envíos autónomos ni Meta Cloud API. Push necesita VAPID fuera de Git y opt-in explícito de una sola tablet corporativa; avisos genéricos, deduplicados y revalidados. Android/tablet real, perfil WhatsApp y restricciones iOS están pendientes de validación. Aceptación del proveedor no acredita entrega en el dispositivo. Centro in-app es el fallback.

Demo /demo: solo datos sintéticos estáticos, filtros locales, sin API privada ni sesión compartida. La aplicación interna conserva guard global, sesiones revocables, cookies protegidas, control de origen y clave interna del proxy. No abrir GET de clientes, precios, saldos, documentos o cobros a visitantes. Código público no significa datos públicos.

Evidencia final local: baseline de Fase 2 renovado con typecheck/build, 23 unitarias y 32 E2E aprobados. Fase 3: typecheck/build aprobados, 90/90 unitarias en 11 archivos (17,59 s) y 53/53 E2E (4,3 min). Migraciones 0000–0010 fresh/upgrade aprobaron el 2026-11-04 22:54:14–22:54:29 UTC: 16 tablas previas y seis hashes conservados, dos cajas + cuatro blíster, piezas null, costo 84 de 90; ambas bases temporales propias retiradas. Informe 2b09937b4ce6d75ddacd867c. No reescribir migraciones aplicadas ni usar db push.

La primera suite detectó errores SQL 42883 y 42501. Se corrigieron con alias JSON explícitos (migración 0010) y retirando locks redundantes sobre documentos inmutables, sin ampliar privilegios. Dos desbordes a 390 px de la segunda suite también se corrigieron; la ejecución final aprobó 53/53. Incluye diez casos comerciales, permisos privados, PDF, reintentos de venta/abono/recepción y tasa posterior sin alterar deuda/recibo. Tres PDF sintéticos y ocho páginas fueron inspeccionados y hay capturas responsive locales. Grabación y dispositivos físicos siguen pendientes; no confundir QA local con release desplegada.

No ejecutes pruebas contra staging. El script test:e2e administra manzanas_maracay_test en loopback 3200/3201 y PostgreSQL 55432. Coordina servicios si otro agente está verificando. Credenciales locales en .local/auth-local.json son privadas: no imprimirlas ni copiarlas. No expongas .env, tokens, hashes, llaves, respaldos o datos de clientes en Git/chat/capturas.

Staging usa recursos exclusivos, API/DB internas y servicio mm-staging-web. Hubo una incidencia histórica de Fase 2: alias genérico web colisionó con Socios y produjo 502; se corrigió con alias propio y prioridad de gateway −1, y se verificaron Manzanas/Socios/Pedal y sesiones. No reutilices el Compose antiguo ni niegues el incidente. No reiniciar servicios ajenos ni usar prune/down-v. Nuevo DNS/proxy/firewall/red compartida requiere autorización concreta adicional; autorizar demo no amplía esa facultad.

QA local aprobado. Antes del despliegue comercial completo faltan respaldo/restauración aislada, revisión final de secretos, publicación trazable sin merge, rollback y smoke externo. Preparación temporal solo web: rama phase-3/demo-publica-temporal, commit db16c574542347cc15c89498184873b9e5953d84, ya publicada en GitHub y en transferencia al VPS al corte; no cambia API/esquema de Fase 2. Registrar release efectiva, comprobar versión/acceso público y privado en incógnito y comparar identidades/salud de servicios preexistentes. No afirmar activación hasta verificarla. La restauración de Fase 2 no sustituye el ensayo de Fase 3.

Faltan copia segura fuera del VPS, revisión fiscal y dispositivos reales para considerar producción. No declararla lista. Conserva logo oficial intacto y skill local manzanas-inventory-integrity, usando docs/domain-rules.md como fuente primaria. Primero identifica problemas verificables y el trabajo pendiente; no propongas otra fase ni supongas autorizaciones sobre proyectos ajenos.
```
