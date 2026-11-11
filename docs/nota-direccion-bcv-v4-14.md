# Dirección del local y equivalente BCV de la venta — V4.14

El propietario solicitó la dirección de su local en la nota y el importe en bolívares para las ventas pactadas a BCV. Confirmó expresamente que se debe usar **la tasa del día de la venta**, también al reimprimir una venta a crédito en una fecha posterior.

El encabezado existente admite dirección y la repite en cada página. Se prepara la dirección entregada por el propietario como configuración privada del emisor; la razón social, el RIF y el logo se conservan. No se incorporan datos del negocio ni notas reales al repositorio público.

La nota y el comprobante de una venta BCV muestran el total USD original y su equivalente en bolívares. La conversión utiliza una única observación oficial verificada cuyo intervalo incluye el instante de la venta en Caracas; presenta la tasa con su precisión original y su fecha valor oficial. En continuidad de fines de semana se conserva la fecha valor original. La consulta es local, parametrizada y de solo lectura; no consulta Internet al imprimir. Una tasa histórica puede servir para el documento aunque ya no permita cobrar hoy. Si la evidencia del período falta o resulta ambigua, el PDF sigue abriendo con su total USD y explica que no pudo calcular la equivalencia; no sustituye silenciosamente la tasa por la actual.

El total en Bs. usa Decimal y redondeo final a dos decimales. Es el equivalente del total de la venta, no un pago recibido ni el saldo actual. No cambia precio, acuerdo, deuda, abonos ni sus tasas históricas. Las ventas en divisa y los recibos de abono conservan su comportamiento. La nota continúa sin observaciones ni saldo actual y conserva firmas, fecha y condición contado/crédito.

No se añaden migraciones ni se modifican las 17 existentes. Se conserva la apertura directa de documentos en Android/PWA de V4.13. La actualización del archivo privado del emisor se hará con comparación del original, copia previa y sustitución atómica, dentro del directorio exclusivo del negocio.

Estado: V4.14 publicada y saludable con runtime `4e99d7bd1bb750f08048463128c3ad609c389fb5`, después de la autorización específica del propietario. Los bloqueos previos de revisión quedaron resueltos al autorizar expresamente la subida/build, los respaldos cifrados en computadora y mismo VPS y la restauración aislada. No repetir la publicación ni resetear datos.


Verificación: tipos/builds y 460 unitarias PASS; 12 documentos dirigidos PASS; suite general 165/167 y repetición BCV/crédito 3/3 con el mismo código y pruebas. Dos casos de la suite general encontraron tiempos de espera de PostgreSQL local: uno al cargar el formulario BCV y otro al preparar datos del recorrido de crédito. Se conserva la traza. Una prueba unitaria existente de tres PDFs agotó inicialmente 5 segundos; mantiene sus aserciones con un presupuesto de renderizado de 20 segundos y la comprobación final aprobó. Ocho controles del operador y 21 de acceso/documentos en staging PASS; Carta y A4 revisadas visualmente. No afirmar 167/167 en una sola ejecución ni impresión física comprobada. Ver `verificacion-v4-14.json`.


Publicación: todas las filas conservadas durante el cambio de código, 17 migraciones sin DDL, acceso/tablet intactos, recolector reanudado y 21 controles HTTPS reales PASS. Dirección instalada mediante sustitución atómica del archivo privado, con copia del anterior y nombre/RIF conservados. Las notas Carta/A4 de una venta existente devolvieron PDF protegido y se comprobó la dirección, el total exacto en Bs. y la tasa/fecha de la venta; la venta permaneció intacta. No se crearon operaciones sintéticas. Respaldo posterior cifrado PC/VPS restaurado correctamente a 2026-11-11T14:37:01.279727+00:00. La impresión física sigue pendiente del propietario.


El propietario informó que la misma venta muestra Bs. en el teléfono pero no en la tablet instalada. El PDF actual del servidor fue comprobado en Carta/A4 y seis acciones reales en modos instalado/Android simulados pasaron. Se indicó abrir una descarga nueva; falta confirmación del dispositivo físico. No afirmar una causa de caché confirmada ni que ese reporte ya quedó resuelto.
