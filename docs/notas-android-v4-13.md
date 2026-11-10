# Apertura de notas desde Android y la aplicación instalada — V4.13

El propietario informó que abrir la nota de entrega desde el ícono instalado en la tablet mostraba un error genérico. El PDF de la venta existente respondió correctamente en Carta, A4 y comprobante, y se revisó su renderizado. La apertura también funcionó en un navegador de escritorio con tamaño de tablet; esa emulación no reproduce el visor externo del dispositivo físico.

El flujo anterior descargaba el archivo con JavaScript y generaba una dirección `blob:` temporal para abrirlo. La corrección usa el enlace HTTPS autenticado del documento en Android y en la aplicación instalada. El navegador recibe directamente el archivo y lo puede mostrar o entregar a su visor; no depende de transferir una dirección temporal entre la aplicación y el visor. La nota mantiene sus bytes, diseño, emisor y datos.

Los enlaces conservan el acceso privado, las respuestas sin caché y la validación de PDF del proxy. Solo una respuesta correcta tiene disposición de descarga; no se fuerza la descarga de HTML o JSON de error mediante el atributo `download`. La ventana nueva no conserva acceso a la aplicación de origen. En escritorio se mantiene la validación y los mensajes existentes; si falla el visor se ofrece además un enlace directo, sin atribuir automáticamente el fallo a la conexión.

No cambian API, inventario, ventas, cobros, tasas ni las 17 migraciones. Consultar o imprimir una venta no vuelve a confirmarla. Las nuevas regresiones simulan Android y el modo instalado con `URL.createObjectURL` inutilizable, comprueban navegación directa del documento, respuesta PDF y ausencia de escrituras comerciales. Otra regresión comprueba el enlace de recuperación en escritorio.

Estado: corrección local en pruebas. V4.12 sigue publicada. Preparar y verificar el candidato antes de solicitar aprobación operativa para producción; no reutilizar la autorización de V4.12. La comprobación del visor físico Android corresponde al dispositivo del propietario y debe registrarse como pendiente hasta que lo pruebe.
