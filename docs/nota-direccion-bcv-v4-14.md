# Dirección del local y equivalente BCV de la venta — V4.14

El propietario solicitó la dirección de su local en la nota y el importe en bolívares para las ventas pactadas a BCV. Confirmó expresamente que se debe usar **la tasa del día de la venta**, también al reimprimir una venta a crédito en una fecha posterior.

El encabezado existente admite dirección y la repite en cada página. Se prepara la dirección entregada por el propietario como configuración privada del emisor; la razón social, el RIF y el logo se conservan. No se incorporan datos del negocio ni notas reales al repositorio público.

La nota y el comprobante de una venta BCV muestran el total USD original y su equivalente en bolívares. La conversión utiliza una única observación oficial verificada cuyo intervalo incluye el instante de la venta en Caracas; presenta la tasa con su precisión original y su fecha valor oficial. En continuidad de fines de semana se conserva la fecha valor original. La consulta es local, parametrizada y de solo lectura; no consulta Internet al imprimir. Una tasa histórica puede servir para el documento aunque ya no permita cobrar hoy. Si la evidencia del período falta o resulta ambigua, el PDF sigue abriendo con su total USD y explica que no pudo calcular la equivalencia; no sustituye silenciosamente la tasa por la actual.

El total en Bs. usa Decimal y redondeo final a dos decimales. Es el equivalente del total de la venta, no un pago recibido ni el saldo actual. No cambia precio, acuerdo, deuda, abonos ni sus tasas históricas. Las ventas en divisa y los recibos de abono conservan su comportamiento. La nota continúa sin observaciones ni saldo actual y conserva firmas, fecha y condición contado/crédito.

No se añaden migraciones ni se modifican las 17 existentes. Se conserva la apertura directa de documentos en Android/PWA de V4.13. La actualización del archivo privado del emisor se hará con comparación del original, copia previa y sustitución atómica, dentro del directorio exclusivo del negocio.

Estado: implementación y verificaciones en curso. Producción sigue en V4.13, runtime `317460e390cacd87a759e7784d724c8fd693cb84`. Se requiere aprobación operativa específica del propietario después de presentar el candidato y las verificaciones; no reutilizar la aprobación anterior ni resetear datos.
