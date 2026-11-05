# Hotfix UX V3: catálogo, ventas y acuerdo de cobro

Estado de este documento: candidato en verificación. Los resultados finales y el commit desplegado se completarán únicamente tras las pruebas y la actualización aislada de staging. Producción sigue en `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`.

## Cambios para el negocio

Agregar producto es la entrada principal permanente del catálogo. El recorrido tiene tres pasos y permite crear fruta, variedad y calibre en la misma pantalla. Las sugerencias no inventan cantidades de blísteres, existencias ni precios. El producto guardado se puede llevar seleccionado a la recepción.

Nueva venta reúne cliente, acuerdo de precio, productos y cobro. Contado completa el total y no presenta fechas de deuda. Crédito sin abono no exige moneda o método ni genera un asiento de cero. Las fechas pactada y de recordatorio son independientes. La revisión conserva su importe, cotización y clave de reintento; un fallo de conexión no justifica crear una segunda operación.

El acuerdo se decide al vender, tanto al contado como a crédito:

| Acuerdo original | Precio                            | Cobro posterior                                                           |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------- |
| Divisa/promoción | Promocional pactado en USD        | USD o USDT 1:1; si recibe bolívares, usar USDT compra verificado          |
| Bolívares a BCV  | Regular pactado, expresado en USD | Bolívares a BCV oficial; USD o USDT cancelan el mismo importe regular 1:1 |

Abonar no cambia el precio pactado ni recalcula los abonos anteriores. Un pago en bolívares no mezcla comprobantes de acuerdos distintos. Un pago USD/USDT sí puede distribuirse entre ellos, siempre con reparto explícito. Los documentos históricos conservan su regla anterior de BCV; no se reinterpretaron.

## Causas y correcciones

| Problema reproducido                                         | Causa                                                            | Corrección principal                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| No se reconoce cómo agregar otro producto                    | Alta principal llamada configuración y maestros separados        | `product-form.tsx`, `product-catalog-field.tsx`, `catalog-screen.tsx`: altas contextuales y tres pasos |
| Se pierde el producto al ir a recibir                        | Navegación sin selección contextual                              | `receipt-screen.tsx` y página de recepciones: producto preseleccionado y retorno validado              |
| Contado muestra recordatorio y admite estado oculto residual | Campo siempre visible y payload independiente de condición/saldo | `sales-screen.tsx`, dominio y API: fechas limpias/rechazo del payload incompatible                     |
| Se teclean importe y método redundantes                      | Monto manual y método libre                                      | Total derivado en contado y selector de métodos confirmados en ventas/abonos                           |
| La lista de precios no expresa el acuerdo al cobrar          | Precio por línea sin regla de liquidación persistida             | Acuerdo homogéneo de venta y snapshot inmutable; tasa según acuerdo original                           |
| Stock físico no basta para saber qué se puede vender         | Cantidades sin todas las condiciones de presentación/costo/FIFO  | Endpoint de disponibilidad vendible; la transacción vuelve a comprobar disponibilidad                  |
| Una venta pagada podía conservar criterios de aviso          | Validaciones incompletas de condición/saldo                      | Fechas rechazadas al crear una venta ya pagada y consultas push limitadas a crédito pendiente          |

## Fuentes de tasas

BCV se obtiene directamente de [la página oficial](https://www.bcv.org.ve/), sección USD y fecha valor de Caracas. Se conserva la evidencia de fuente, hash, fecha de consulta, verificación y vigencia. El intervalo conservador termina a medianoche posterior a la fecha valor; no prolonga automáticamente una publicación antigua durante fines de semana o feriados. Si no puede verificarse una fecha vigente, el cobro BCV queda indisponible.

USDT usa la cotización pública **BUY USDT/VES de Binance P2P** documentada en la [guía oficial de Binance](https://www.binance.com/en/skills/detail/binance/p2p). Es una referencia general sin filtro de banco o monto; no es una compra ejecutada ni una oferta garantizada para un importe particular. Su observación vale diez minutos. El recolector está preparado para consultar cada cinco minutos y no requiere claves de una cuenta Binance ni permisos para operar.

Las consultas de red se realizan fuera de las transacciones comerciales, mediante un recolector y rol exclusivos. La API solo lee la caché verificada. Un cobro VES envía el identificador de la cotización revisada; el servidor comprueba fuente, acuerdo y vigencia tanto al recibir como al confirmar. Un reintento ya confirmado recupera su recibo aunque la tasa haya vencido. USD y USDT no necesitan una conversión a bolívares.

La cadena TLS incompleta de BCV se completa con el intermedio público de Sectigo verificado; se mantienen raíces estándar, hostname y caducidad. Véase [procedencia del certificado](../scripts/certs/README.md). No se desactivó TLS ni se aceptó una tasa del navegador.

## Integridad y cambio de esquema

Se conserva el contenido de las trece migraciones aplicadas. La nueva `0013_agreed_settlement_rates` agrega acuerdo de cobro y evidencia USDT, adapta las restricciones de pagos y mantiene el historial inmutable. Los documentos antiguos reciben únicamente la clasificación histórica `legacy_bcv`; sus importes, líneas, aplicaciones y fuentes no cambian. Los roles de la web/API no pueden insertar tasas.

El diagnóstico del registro real “Manzana Gala” se realizó en lectura y se entregó fuera del repositorio público. No se renombró, borró ni reorganizó ningún dato del propietario.

## Verificación y entrega

Pendiente de incorporar resultados finales: check completo, E2E, QA con base vacía, preservación de 13 migraciones, capturas/vídeo, staging exacto y comprobación de tasas del recolector.

La actualización autorizada es de QA/staging. No se cambia DNS, Caddy, firewall ni el tráfico de producción. El procedimiento prepara imágenes por SHA, verifica respaldo restaurado antes y después de migrar y compara los servicios ajenos. Una reversión de esquema requiere restauración coordinada y revisión de escrituras posteriores; no se afirma que bastaría arrancar una imagen antigua sobre el esquema nuevo.

Consultar la [prueba manual de cinco minutos y revisión de otros módulos](hotfix-ux-v3-checklist.md). Android físico, perfil de WhatsApp corporativo, entrega push real y HP Smart Tank 215 no se sustituyen por emulación de navegador. Los PDF siguen siendo comerciales, no fiscales.
