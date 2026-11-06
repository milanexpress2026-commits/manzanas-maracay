# Reglas permanentes del negocio

Fuentes vigentes: [continuación V4.2 corregida](referencias/brief-recepcion-rapida-v4-2.txt), [brief de catálogo y tasas V4](referencias/brief-catalogo-tasas-v4.txt), [hotfix UX v3](referencias/brief-hotfix-ux-v3.txt) y aclaraciones del propietario del 5 de noviembre de 2026. V4.2 sustituye la duda anterior sobre calibre 100 y simplifica la recepción; no reinterpreta documentos existentes. Incluye implementación, QA/staging y preparación completa de producción. La promoción de su commit y migraciones a la instancia real requiere la aprobación expresa prevista en el apartado 8. No se autoriza emisión fiscal SENIAT.

## Productos y configuraciones

- Fruta → variedad opcional → calibre opcional → línea comercial → configuración → lote. Variedad/calibre, cuando existen, pertenecen a la misma fruta. Una combinación vacía no se representa con una variedad ficticia. Calibre es etiqueta de tamaño, nunca conteo de frutas.
- Manzanas tradicionales: Gala, Roja normal, Verde, Pink Lady y Amarilla son distintas; Lady histórico no se fusiona con Pink Lady. Opciones habituales: 80, 88, 100, 113, 125, 135, 150, 163, 175, 198 y 216. Regla confirmada V4.2: calibre menor o igual a 100 lleva 4 blísteres; mayor a 100 lleva 5. Incluye exactamente 100 y no requiere volver a preguntar ese límite. Solo se aplica a manzana tradicional con blíster, nunca a granel ni a otras frutas. No cuenta piezas. Una excepción real requiere confirmación explícita por lote y conserva la configuración y snapshots históricos. Una media sin método confirmado permanece no disponible. El catálogo habitual muestra opciones sin crear todas sus combinaciones físicas; materializa solo las necesarias, reutiliza coincidencias exactas normalizadas y no renombra históricos.
- Manzana granel es una línea de presentación, no variedad. Calibres 150, 163, 175, 198, 216, 232. Caja/media, sin blíster ni conteo por manzana.
- Pera Forelle/Packcam conserva la ortografía comunicada. Calibres 70, 80, 90, 100, 110, 120 y 135. Cantidad de blíster y preparación de mitad pendientes de confirmación, sin valores inventados.
- Kiwi no exige variedad ni calibre: caja de 10 kg y media de 5 kg, sin pesar cada venta ni contar kiwis. Uva Roja/Morada/Verde permanecen separadas y solo por caja, sin peso, racimos, blíster ni medias.
- Ciruela, Nectarina, Naranja y Mandarina se ofrecen como frutas; no tienen presentaciones, calibres, peso ni precios inventados. Su configuración pendiente no bloquea otras mercancías.
- La configuración usa capacidades genéricas: `packingModel=blister|halves|whole`, `halfPreparation=counted|commercial|pending|none`, presentaciones autorizadas y peso definido opcional. No hay excepciones de código por nombre de fruta.
- Blíster por caja admite una excepción explícita por lote; fuera de las reglas confirmadas, desconocido permanece null. Los ejemplos antiguos no prevalecen sobre la aclaración V4.2. Una configuración ya confirmada distinta se conserva y muestra su discrepancia; no se recostean lotes anteriores.
- Las plantillas exponen calibres habituales y alta excepcional. Ver opciones no crea existencias ni precios. Guardar varios calibres crea únicamente las combinaciones elegidas. Las operaciones nuevas pueden materializar una opción habitual dentro de la misma transacción de recepción.
- Renombrar una variedad requiere nombre anterior coincidente y auditoría. No cambia descripciones históricas de comprobantes.

## Recepción y precios

Una recepción contiene varias líneas revisables: producto, calibre, cajas y costo USD confirmado. Proveedor real opcional; NULL se muestra como «Sin proveedor indicado» y no crea proveedor genérico. Fecha/hora automática en servidor, editable en detalles con zona Caracas; documento externo y notas opcionales. Número interno único generado por servidor, separado del documento externo. Las referencias históricas permanecen intactas. Límite operativo 50 líneas/1.000 cajas. Se comprueba idempotencia antes de generar fecha/número o materializar catálogo; una transacción confirma documento, lotes, stock, auditoría y cambios explícitos.

El primer costo real es obligatorio y positivo; no se introduce stock provisional ni costo cero ficticio. En ingresos posteriores se ofrece el último costo real identificado por lote y se exige aceptarlo explícitamente o introducir otro. La propuesta se revalida al guardar. El resumen muestra el costo aplicado antes de confirmar. Costos, documentos y snapshots anteriores permanecen inmutables; no se modifica la lista de precios por cambiar el costo.

Cada lote conserva costo, empaque, versión de configuración, modalidad, presentaciones, peso definido y fecha de ingreso. Cambiar catálogo o costo de otra recepción no reescribe estos snapshots. Proveedores se desactivan, no se borran silenciosamente. Un almacén inicial, sin sistema multisucursal todavía.

La recepción V4 puede confirmar explícitamente el empaque pendiente con su versión esperada dentro de la misma transacción del ingreso. El operador revisa la cantidad y presentaciones en esa pantalla. Esta confirmación actualiza la configuración para esa recepción y las siguientes; cada lote nuevo toma su snapshot y los anteriores permanecen intactos. Si falla cualquier línea, revierte también la confirmación y los precios del documento. Una edición concurrente exige revisar la versión actual; el reintento de un ingreso ya confirmado devuelve el mismo resultado.

Dos listas independientes por presentación, ambas expresadas en USD: promocional para acuerdo en divisa y común para acuerdo inicial en bolívares BCV. La elección se pacta al crear la venta y es independiente de contado/crédito. Con dos precios distintos no se elige una lista por inferirla de la condición de pago. Se permite negociar el precio de cada línea sin modificar la lista ni su referencia histórica. El operador elige Conservar/Actualizar precios al recibir; costo de compra no cambia lista automáticamente. Media y blíster no tienen que valer proporcionalmente a la caja. Solo costo de mercancía; no flete, descarga ni gastos accesorios. Margen mostrado es ganancia bruta estimada.

Una venta nueva conserva un único acuerdo: `divisa` para líneas promocionales o `bcv` para líneas comunes. Acuerdos distintos se registran en ventas separadas. Las ventas anteriores al hotfix conservan `legacy_bcv`, que mantiene su comportamiento anterior sin cambiar precios, importes, pagos ni costos; no se permite usar esa categoría al crear una venta nueva.

## Inventario físico y costos

- Un recipiente no es otra cantidad adicional. Solo se suman existencias terminales. Caja abierta saldo de caja cerrada cero; hijos disponibles en su interior. Vacíos y retirados permanecen en historial, fuera del disponible.
- Tres cajas de cinco blíster menos uno: dos cajas cerradas y cuatro blíster en una caja abierta; catorce equivalentes. El retiro prioriza blíster abiertos dentro del lote antes de abrir otra caja.
- Mitad con conteo: registrar piezas reales contadas = preparadas + remanentes. 37 = 18 + 19; rechazar 18 + 20. No ofrecer esas piezas como presentación de venta.
- Mitad comercial granel/kiwi: dividir una caja en dos recipientes de media, piezas null. Diez cajas menos caja+media dejan ocho cajas cerradas y una media (8,5 equivalentes), nunca 8,5 cajas cerradas. Kiwi mantiene equivalencia de 5 kg por media.
- Desconocido null no equivale a cero. Medias contadas no se convierten a una equivalencia ficticia universal. Pera pendiente no habilita fraccionar hasta configurar un método confirmado.
- Costos NUMERIC/Decimal a cuatro decimales. Abrir/fraccionar distribuye el costo existente: porciones anteriores redondean hacia abajo y la última conserva el residuo. Ejemplo 25/3: 8,3333 + 8,3333 + 8,3334. No crear costo al abrir.
- Una entrada de costo inmutable acompaña cada movimiento físico; la proyección de costo se concilia con ese historial. La ampliación de fase 2 usa una base de costo trazable reconstruida desde sus snapshots sin editar eventos antiguos. Un costo que no pueda reconstruirse queda desconocido y bloquea vender ese recipiente.
- Ajustes con motivo conservan historial; reducción de fruta contada reduce proporcionalmente su valor a cuatro decimales. Recuperar existencia desde cero exige reversa admisible o recepción, para conservar fuente/costo. No borrar eventos.

## Transacciones y FIFO

Orden común: clave idempotente y huella con actor → bloqueo del árbol → lotes/saldos y documentos en orden estable. Actor siempre de la sesión. Una misma clave/datos/actor devuelve mismo resultado; una clave reutilizada con datos diferentes falla. Todos los cambios, auditoría y respuesta se confirman juntos. Nada de red externa dentro de la transacción.

Ventas asignan automáticamente lotes por recepción/creación/ID, compatibles con variante/presentación y entorno DEMO/real. El operario no elige lotes. Se conserva asignación por línea, lote, recipiente, movimiento y costo. Un comprobante y su salida de stock usan el mismo PoolClient/commit; no se crea un segundo stock. Una caja completa requiere caja cerrada; no se arma ficticiamente con equivalentes.

10 cajas a 25 más 10 a 27, vender 12 a 40: costo 304, ingreso 480, bruto 176; quedan ocho cajas del segundo lote. FIFO es asignación contable; se documenta que la selección física puede diferir. No reescribir documentos históricos para corregir esa diferencia.

PostgreSQL impide cantidades negativas, padres incompatibles/ciclos, doble conteo, proyección sin ledger, modificaciones históricas y entradas tardías. La serialización conservadora puede limitar escala; se prioriza integridad y no se hacen llamadas de red dentro del bloqueo.

## Ventas, documentos y correcciones

Clientes con teléfono internacional normalizado opcional. Múltiples líneas, cantidad entera por presentación autorizada, precio de referencia obtenido del servidor y pactado editable. Caja+media se expresan como dos líneas, no 1,5 cajas cerradas. Cinco cajas a 38 totalizan 190 sin modificar lista.

Contado/crédito sin aprobaciones ni límites comerciales. Contado liquida el total y rechaza fecha pactada o recordatorio incluso en una solicitud manipulada. Crédito puede tener pago inicial cero (ausencia de abono, no asiento cero), parcial o total, fecha pactada o ninguna. Una venta completamente pagada no admite fechas nuevas de cobranza. Cambiar opciones en el formulario no mueve inventario; confirmar descuenta stock una sola vez. Moneda de referencia/deuda USD; mostrar bruto estimado sin otros gastos.

PDF con logo y numeración única comercial, fecha Caracas, cliente, productos, cantidades, precio pactado, total, abonos y saldo. Etiqueta COMPROBANTE DE VENTA, sin afirmar validez fiscal. El PDF del cliente no expone costos de compra internos.

Anular o corregir genera eventos compensatorios; nunca borra ventas confirmadas. Anulación completa solo cuando no hay abonos activos y el movimiento de cada lote puede revertirse sin dependencias posteriores; restituye la misma fuente/costo. Reversar abono genera evento nuevo. Devoluciones parciales y condiciones particulares siguen pendientes de decisión, sin un flujo improvisado.

## Abonos, fechas y BCV

Saldo USD derivado de venta confirmada menos aplicaciones de abonos activos. Desde un comprobante se preselecciona; desde cliente se elige explícitamente. Reparto entre varias facturas tiene suma revisable exacta. No aplicar exceso ni asignarlo a otra deuda automáticamente. Bloqueos y restricciones impiden sobrepago concurrente. USD y USDT se aplican 1:1 a esa deuda, sin cambio del precio pactado. Un abono en USD/USDT puede repartirse entre acuerdos distintos; un abono VES requiere una misma fuente de conversión y se divide en operaciones separadas si mezcla divisa con BCV. `bcv` y `legacy_bcv` comparten fuente BCV.

Métodos habilitados por ahora: Efectivo USD (`usd_cash`), Transferencia USDT (`usdt_transfer`) y Bolívares (`bolivares`). El último es una modalidad genérica confirmada, sin atribuir un banco, pago móvil ni punto de venta que el dueño no haya confirmado. El servidor valida moneda/método; los nombres históricos de efectivo USD se conservan para compatibilidad, sin reescribir recibos. No se habilita texto libre como vía para aceptar medios no confirmados.

La interfaz V4 muestra cuatro opciones comerciales: Efectivo USD, Bolívares a tasa BCV, USDT y Bolívares a tasa USDT compra. Las dos opciones en bolívares reciben la misma moneda VES y se distinguen por la fuente compatible con el acuerdo inicial, no por una cuarta moneda ni por otro ledger. Los métodos incompatibles aparecen deshabilitados con explicación; elegirlos no cambia el precio pactado. En crédito, el operador indica si desea un abono inicial antes de ver su importe y método.

Cada abono positivo confirmado conserva importe/moneda original, equivalente USD, fecha, método, actor, aplicaciones y saldo restante, con recibo PDF comercial. No se envía automáticamente a WhatsApp. Pagada queda saldo cero y fuera de pendientes.

Fecha pactada y recordatorio interno son distintos; 7/15 días o calendario personalizado. Solo se reprograma crédito con saldo pendiente. Cambios dejan eventos; no se sobrescribe vencimiento original. Al pagar completo se excluye la venta de pendientes, vencidos y avisos; sus fechas históricas no se borran. Reversar un abono de contado no convierte la venta en crédito ni habilita fechas de cobranza. Reloj y agrupación comerciales America/Caracas en servidor, no zona del navegador.

El acuerdo inicial determina la conversión VES: una venta pactada en divisa usa la cotización USDT de compra; una venta pactada desde el inicio en bolívares BCV usa la tasa oficial BCV. Pagar más adelante en otra moneda no selecciona otra lista ni modifica el precio original. El saldo histórico permanece USD; cada recibo conserva importe original, equivalente y la tasa histórica aplicada.

La fuente BCV es su [página oficial](https://www.bcv.org.ve/), sección USD y fecha valor publicada. La ventana operativa de esta aplicación dura 24 horas desde las 00:00 de esa fecha en Caracas, con intervalo `[validFrom, validUntil)`. Una fecha futura todavía no es vigente. No se extiende una cotización vencida por fin de semana ni se usa una última tasa disponible como sustituto. Esa ventana es una política de verificación del sistema, no una afirmación sobre obligaciones fiscales.

La fuente comercial USDT es la [cotización pública de compra de Binance para USDT/VES](https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=VES&asset=USDT&tradeType=BUY), consulta `BUY` general sin filtrar un método bancario. Se conserva una observación durante diez minutos; no se presenta como oferta de un comerciante específico, tasa oficial BCV ni operación de intercambio ejecutada. No se contacta a vendedores ni se realiza una transferencia mediante esta integración.

Ambas fuentes requieren HTTPS estricto, origen exacto, respuesta reciente verificable, valor positivo, huella y fechas históricas. El recolector separado consulta las fuentes fuera de transacciones comerciales y guarda observaciones inmutables con su rol exclusivo; el rol de la API solo lee la caché. El navegador envía el identificador de la cotización revisada, nunca su valor. Al confirmar VES se verifica el mismo registro tanto para la fecha efectiva del cobro como para el instante actual; una cotización vencida exige actualizar y revisar el importe. Un reintento de una operación ya confirmada recupera su resultado antes de consultar tasas y no cobra otra vez. Si la fuente aplicable no puede verificarse, ese cobro VES queda bloqueado; USD/USDT 1:1 continúan. Una tasa sintética solo existe en las bases aisladas de QA, nunca se publica como tasa real.

## Cobranza y comunicaciones

Centro in-app hoy/próximas/vencidas y fallback permanente. WhatsApp usa chat del número internacional guardado con texto prellenado y saldo actual; el operador pulsa Enviar. No envíos autónomos ni Meta Cloud API. El dispositivo debe comprobar qué aplicación/perfil abre.

Push requiere configuración VAPID externa y opt-in explícito de una sola tablet corporativa, reemplazo auditable y deduplicación factura/fecha. No se suscriben todos los socios. Aviso agrupado genérico sin datos privados en pantalla bloqueada; el centro autenticado muestra detalle. Sin configuración/dispositivo, informar estado y no afirmar entrega probada.

## Demo, acceso y operación segura

La demo de QA contiene datos sintéticos claramente marcados, solo lectura o simulación aislada sin persistencia operativa. En producción `/demo` y sus rutas no están disponibles; la entrada lleva al acceso privado o al tablero real. Ningún visitante consulta datos operativos ni recibe sesión/token interno. Cookies seguras, CSRF y límites de intentos siguen activos. La publicidad del repositorio no publica datos.

Staging conserva su base/recursos propios, historial DEMO y etiqueta de pruebas. Producción usa una base nueva, volumen, roles, claves y redes independientes y alias `mm-production-web`; no se reaprovecha ni se convierte staging (`mm-staging-web`). La instancia de base queda vinculada inmutablemente al entorno y las escrituras comerciales permanecen cerradas hasta validar su activación. No convertir `is_demo` globalmente ni cargar pruebas sintéticas en producción. Una configuración pendiente no habilita recepciones o ventas reales que dependan de ella.

El propietario eligió un acceso privado de dueños desde celulares y tablet, sin exigir cuentas individuales. La auditoría identifica esa cuenta compartida, no atribuye acciones a una persona que el sistema no identifica. La cuenta se aprovisiona mediante herramienta privada; no hay usuario universal ni registro público. El respaldo cifrado externo en esta computadora está autorizado; su recuperación debe probarse en aislamiento. DNS/proxy/firewall/red compartida requieren aprobación concreta. Secretos, sesiones, claves y backups fuera de Git, capturas y logs; rol de aplicación y propietario de base sin superusuario.

Revisar build/tipos/unitarias/E2E, base limpia y actualización desde fase2, concurrency, accesibilidad y tamaños 390/800/1024/1440. No declarar producción lista sin copia externa del respaldo, revisión fiscal y prueba en dispositivos reales. Aplicar la skill manzanas-inventory-integrity y registrar resultados actuales, no solo textos o capturas.
