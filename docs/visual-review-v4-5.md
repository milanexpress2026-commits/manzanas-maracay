# Revisión visual V4.5

Código: `817a2783da7c4405e9c9609335adfe239a88e3ef`; ajustes de pruebas en `998cceb478b525ceecda5e24ff53e86ce2c7105e`, sin cambiar la aplicación. Las imágenes siguientes proceden de Chromium con datos sintéticos y tamaños de pantalla emulados. No representan una tablet física ni operaciones del negocio.

La recepción se revisó en 390, 800, 1024 y 1440 píxeles. Muestra producto y cantidad; proveedor, referencia y notas permanecen opcionales. No aparecen campos de costo ni de lista de precios. El campo enfocado queda visible y no se superpone con el botón «Revisar y guardar». Los títulos largos se ajustan dentro de la tarjeta. Las aserciones de desbordamiento, foco y accesibilidad pasaron.

| Pantalla                                          | Evidencia                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| Recepción, teléfono emulado de 390 px             | [Captura](capturas/operacion-simple-v4-5/recepcion-390.png)           |
| Recepción, tablet emulada de 800 px               | [Captura](capturas/operacion-simple-v4-5/recepcion-800.png)           |
| Recepción, 1024 px                                | [Captura](capturas/operacion-simple-v4-5/recepcion-1024.png)          |
| Recepción, escritorio de 1440 px                  | [Captura](capturas/operacion-simple-v4-5/recepcion-1440.png)          |
| Venta en efectivo USD, 390 px                     | [Captura](capturas/operacion-simple-v4-5/venta-390-usd_cash.png)      |
| Venta USDT y referencia informativa, 800 px       | [Captura](capturas/operacion-simple-v4-5/venta-800-usdt_transfer.png) |
| Venta en Bs. a referencia Binance/USDT, 1024 px   | [Captura](capturas/operacion-simple-v4-5/venta-1024-ves_usdt.png)     |
| Venta en Bs. a BCV, 1440 px                       | [Captura](capturas/operacion-simple-v4-5/venta-1440-ves_bcv.png)      |
| Revisión conservada tras perder la sesión, 390 px | [Captura](capturas/operacion-simple-v4-5/reintento-401-390.png)       |

En la venta, el precio manual y el acuerdo de cobro permanecen distinguibles. La referencia de USDT ocupa un bloque ancho, con el equivalente en Bs. destacado y la fuente/vigencia plegables; no modifica la moneda efectivamente cobrada. Se comprobó la apertura de los metadatos sin desbordamiento. La confirmación se conserva dentro del diálogo y el reintento por sesión expirada mantiene el mismo comando.

Los PDF sintéticos de comprobante comercial, nota de entrega y recibo fueron obtenidos de la API, renderizados e inspeccionados. No muestran costos ni ganancias y conservan el carácter no fiscal. Las lecturas repetidas de esos documentos no añadieron movimientos ni nuevos documentos.

El ensayo de producción aislada pasó 13/13 casos el 6 de noviembre de 2026, entre 21:55:41.114 y 21:58:18.557 UTC. Incluyó el recorrido desde una base vacía: recibir cinco productos sin costos, proveedor ni lista; vender dos cajas a 40; registrar otra venta a crédito a 43 y liquidarla mediante abonos de 10 y 33. El vídeo continuo y las capturas de ese recorrido se generaron en la ejecución aprobada. Su importación e inspección visual están pendientes; no se afirma que ese vídeo nuevo haya sido revisado.

El baseline automatizado reúne 115 casos E2E distintos aprobados entre ejecuciones separadas y los 13 casos de producción aislada; no hubo una única ejecución completamente verde de los 115. Estos resultados no acreditan rendimiento en una tablet Android real, uso con los socios, impresión física de los PDF en la HP ni publicación de V4.5. La ampliación de impresión y recuperación V4.7 se validará por separado.
