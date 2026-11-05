# Reglas permanentes del negocio

Fuente primaria vigente: [brief de fase 4](referencias/brief-fase-4.txt), cuya ejecución y preparación de producción separada fueron autorizadas por el propietario el 4 de noviembre de 2026. El [brief de fase 3](referencias/brief-fase-3.txt) y las entregas anteriores conservan historia. La autorización de desarrollo no sustituye la aprobación concreta de cambios en infraestructura compartida ni la verificación de las condiciones de publicación. No se autoriza emisión fiscal SENIAT.

## Productos y configuraciones

- Fruta → variedad opcional → calibre opcional → línea comercial → configuración → lote. Variedad/calibre, cuando existen, pertenecen a la misma fruta. Una combinación vacía no se representa con una variedad ficticia. Calibre es etiqueta de tamaño, nunca conteo de frutas.
- Manzanas tradicionales: Gala, roja normal, verde, Pink Lady y amarilla son distinciones comerciales comunicadas. Manzana amarilla es una variedad distinta de Gala; el color descriptivo no establece una regla de costo. Se conserva Lady histórico sin asumir equivalencia con Pink Lady. Los calibres y blíster de cada combinación deben confirmarse; ni los ejemplos 80/180 ni 88/100 fijan una regla automática. Venta por presentaciones confirmadas de caja/media/blíster, nunca pieza suelta. En producción no se siembran estas denominaciones como catálogo confirmado: los dueños las ingresan y configuran.
- Manzana granel es una línea de presentación, no variedad. Calibres 150, 163, 175, 198, 216, 232. Caja/media, sin blíster ni conteo por manzana.
- Pera FORELLE/PACKCAM conserva esos nombres, editables. Calibres comunicados 90, 100, 110, 120 y 135. Caja/media/blíster; cantidad de blíster y preparación de mitad pendientes de confirmación, sin valores inventados.
- Kiwi no exige variedad ni calibre: caja de 10 kg y media de 5 kg, sin pesar cada venta ni contar kiwis. Uva ROJA/MORADA solo caja, sin pedir kilos, racimos, blíster ni medias.
- Nuevas frutas pueden definir campos opcionales y presentaciones autorizadas. Mandarina permanece sin reglas hasta confirmación.
- La configuración usa capacidades genéricas: `packingModel=blister|halves|whole`, `halfPreparation=counted|commercial|pending|none`, presentaciones autorizadas y peso definido opcional. No hay excepciones de código por nombre de fruta.
- Blíster por caja es editable/sobrescribible por lote; desconocido permanece null. Los ejemplos antiguos Gala80=5 y Gala180=4 no son reglas reales confirmadas. La configuración puede estar pendiente; se bloquean operaciones que necesitan datos ausentes, no se inventan cantidades.
- Renombrar una variedad requiere nombre anterior coincidente y auditoría. No cambia descripciones históricas de comprobantes.

## Recepción y precios

Una recepción contiene varias líneas revisables antes de confirmar: proveedor, referencia, fecha, configuración, cajas, costo USD y notas. Límite operativo 50 líneas/1.000 cajas; dividir documentos mayores. Recibir crea cajas cerradas con piezas desconocidas. Referencia única por proveedor, idempotencia por operación y transacción única para documento, lotes, stock y cambios explícitos de precios.

Cada lote conserva costo, empaque, versión de configuración, modalidad, presentaciones, peso definido y fecha de ingreso. Cambiar catálogo o costo de otra recepción no reescribe estos snapshots. Proveedores se desactivan, no se borran silenciosamente. Un almacén inicial, sin sistema multisucursal todavía.

Dos listas independientes por presentación, ambas expresadas en USD: promocional efectivo USD y normal para equivalencia VES. El operador elige Conservar/Actualizar precios; costo de compra no cambia lista automáticamente. Media y blíster no tienen que valer proporcionalmente a la caja. Solo costo de mercancía; no flete, descarga ni gastos accesorios. Margen mostrado es ganancia bruta estimada.

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

Contado/crédito sin aprobaciones ni límites comerciales. Crédito puede tener pago inicial cero (ausencia de abono, no asiento cero), fecha pactada o ninguna. Confirmar descuenta stock una sola vez. Moneda de referencia/deuda USD; mostrar bruto estimado sin otros gastos.

PDF con logo y numeración única comercial, fecha Caracas, cliente, productos, cantidades, precio pactado, total, abonos y saldo. Etiqueta COMPROBANTE DE VENTA, sin afirmar validez fiscal. El PDF del cliente no expone costos de compra internos.

Anular o corregir genera eventos compensatorios; nunca borra ventas confirmadas. Anulación completa solo cuando no hay abonos activos y el movimiento de cada lote puede revertirse sin dependencias posteriores; restituye la misma fuente/costo. Reversar abono genera evento nuevo. Devoluciones parciales y condiciones particulares siguen pendientes de decisión, sin un flujo improvisado.

## Abonos, fechas y BCV

Saldo USD derivado de venta confirmada menos aplicaciones de abonos activos. Desde un comprobante se preselecciona; desde cliente se elige explícitamente. Reparto entre varias facturas tiene suma revisable exacta. No aplicar exceso ni asignarlo a otra deuda automáticamente. Bloqueos y restricciones impiden sobrepago concurrente. USD y VES son las únicas monedas habilitables; no USDT.

Cada abono positivo confirmado conserva importe/moneda original, equivalente USD, fecha, método, actor, aplicaciones y saldo restante, con recibo PDF comercial. No se envía automáticamente a WhatsApp. Pagada queda saldo cero y fuera de pendientes.

Fecha pactada y recordatorio interno son distintos; 7/15 días o calendario personalizado. Cambios dejan eventos; no se sobrescribe vencimiento original. Reloj y agrupación comerciales America/Caracas en servidor, no zona del navegador.

Una conversión VES necesita registro BCV oficial positivo, verificado y vigente al momento del cobro, leído por servidor. Intervalo [validFrom,validUntil); fuente HTTPS oficial, hash y fechas históricas. Nunca número del navegador, tasa paralela, futura/vencida ni fixture como tasa real. Si no puede verificarse origen/vigencia, tasa no disponible y VES bloqueado; USD sigue funcionando. Deuda histórica USD no varía con BCV posterior. No hay API oficial supuesta ni TLS desactivado. Procedimiento manual de verificación requiere decisión específica antes de activarlo.

## Cobranza y comunicaciones

Centro in-app hoy/próximas/vencidas y fallback permanente. WhatsApp usa chat del número internacional guardado con texto prellenado y saldo actual; el operador pulsa Enviar. No envíos autónomos ni Meta Cloud API. El dispositivo debe comprobar qué aplicación/perfil abre.

Push requiere configuración VAPID externa y opt-in explícito de una sola tablet corporativa, reemplazo auditable y deduplicación factura/fecha. No se suscriben todos los socios. Aviso agrupado genérico sin datos privados en pantalla bloqueada; el centro autenticado muestra detalle. Sin configuración/dispositivo, informar estado y no afirmar entrega probada.

## Demo, acceso y operación segura

La demo de QA contiene datos sintéticos claramente marcados, solo lectura o simulación aislada sin persistencia operativa. En producción `/demo` y sus rutas no están disponibles; la entrada lleva al acceso privado o al tablero real. Ningún visitante consulta datos operativos ni recibe sesión/token interno. Cookies seguras, CSRF y límites de intentos siguen activos. La publicidad del repositorio no publica datos.

Staging conserva su base/recursos propios, historial DEMO y etiqueta de pruebas. Producción usa una base nueva, volumen, roles, claves y redes independientes y alias `mm-production-web`; no se reaprovecha ni se convierte staging (`mm-staging-web`). La instancia de base queda vinculada inmutablemente al entorno y las escrituras comerciales permanecen cerradas hasta validar su activación. No convertir `is_demo` globalmente ni cargar pruebas sintéticas en producción. Una configuración pendiente no habilita recepciones o ventas reales que dependan de ella.

El propietario eligió un acceso privado de dueños desde celulares y tablet, sin exigir cuentas individuales. La auditoría identifica esa cuenta compartida, no atribuye acciones a una persona que el sistema no identifica. La cuenta se aprovisiona mediante herramienta privada; no hay usuario universal ni registro público. El respaldo cifrado externo en esta computadora está autorizado; su recuperación debe probarse en aislamiento. DNS/proxy/firewall/red compartida requieren aprobación concreta. Secretos, sesiones, claves y backups fuera de Git, capturas y logs; rol de aplicación y propietario de base sin superusuario.

Revisar build/tipos/unitarias/E2E, base limpia y actualización desde fase2, concurrency, accesibilidad y tamaños 390/800/1024/1440. No declarar producción lista sin copia externa del respaldo, revisión fiscal y prueba en dispositivos reales. Aplicar la skill manzanas-inventory-integrity y registrar resultados actuales, no solo textos o capturas.
