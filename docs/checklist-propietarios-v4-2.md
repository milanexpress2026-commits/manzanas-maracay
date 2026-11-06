# Primera recepción de mercancía · V4.2

Esta guía corresponde a la recepción rápida en validación. La versión publicada y las pruebas terminadas se registran en el [informe V4.2](recepcion-rapida-v4-2.md); esta guía no acredita por sí sola su publicación. Las capturas usan datos sintéticos de QA. La comprobación en el teléfono y la tablet Android del negocio sigue pendiente.

## Recibir lo que llegó

1. Entra en **Recepciones** y pulsa **Recibir mercancía**.
2. En **Buscar producto**, escribe fruta, variedad o calibre, por ejemplo `Gala 100`. Toca la opción que coincida con la mercancía. También puedes filtrar por **Fruta**, **Favoritos** o **Recientes**. Estas opciones no indican que ya haya stock.
3. Escribe **Cajas recibidas** y **Costo real por caja · USD**, usando la cantidad y el costo de esa llegada. El primer ingreso necesita el costo real; no se guarda un costo desconocido como cero.
4. Para incluir otro producto en la misma recepción, pulsa **Otra fruta** y completa sus cajas y costo. Puedes mezclar frutas y calibres.
5. Pulsa **Revisar recepción**. Comprueba cada producto, cantidad, costo, empaque y el costo total. **Corregir datos** te permite volver antes de guardar.
6. Pulsa **Guardar recepción**. Espera **Recepción guardada**, con el número `R-…`, la cantidad de cajas y los enlaces a sus lotes. Usa **Ver inventario** para consultarlos o **Recibir más mercancía** para empezar otra llegada.

No necesitas completar proveedor, documento ni fecha en una recepción habitual. El servidor asigna el número y la hora de Venezuela al guardar. Si los necesitas, abre **Más detalles (opcional)**: **Proveedor (opcional)**, **Documento del proveedor (opcional)**, **Fecha y hora de recepción (opcional)** y **Observaciones generales**. Sin proveedor se muestra **Sin proveedor indicado**; no se crea un proveedor ficticio.

## Cuando ya recibiste ese producto

La pantalla muestra **Costo anterior: USD … por caja**, con su fecha. Pulsa **Usar costo anterior** únicamente si sigue siendo el costo real de esta llegada. Si cambió, escribe el nuevo importe; después de aceptar el anterior puedes pulsar **Cambiar costo**. Revisa el importe aplicado en el resumen.

Los precios de venta se conservan. Para cambiarlos expresamente, abre **Notas y precios de este producto**, elige **Actualizar precios** y completa las listas de la presentación correspondiente. El costo de compra y el precio de venta son datos distintos.

## Empaque y casos especiales

- **Manzana tradicional con blíster:** calibre 100 o menor muestra 4 blísteres por caja; superior a 100 muestra 5. No necesitas volver a escoger entre 4 y 5 para una recepción habitual.
- **Una caja real trae otro conteo:** abre **Revisar empaque y excepciones**. En **Excepción solo para este lote**, escribe **Blíster por caja en este lote**, añade **Motivo de la excepción** y marca **Confirmo esta excepción únicamente para este lote**. El cambio queda en ese lote; no modifica los anteriores.
- **Empaque ya registrado distinto del habitual:** revisa el aviso. Marca **Conservar el empaque registrado para esta recepción** si coincide con lo recibido. Para cambiar las presentaciones futuras, usa el enlace al catálogo; el borrador se conserva.
- **Pera u otra presentación pendiente:** completa **Confirmar presentación** con lo que realmente llegó y marca **Verifiqué esta presentación para recibir la mercancía**. No se deduce el conteo de pera a partir de la regla de manzana. Una media caja pendiente no queda habilitada automáticamente.
- **Granel, kiwi y uva:** granel usa caja/media comercial sin blíster; kiwi caja de 10 kg/media de 5 kg; uva solo caja. Ciruela, nectarina, naranja y mandarina piden confirmar la presentación cuando falta.
- **Falta un calibre:** dentro del selector abre **Nuevo calibre**, elige **Fruta del calibre**, escribe **Nuevo calibre** y pulsa **Guardar calibre**. Después búscalo y selecciónalo; las líneas de la recepción permanecen.

## Favoritos, ocultos y borrador

En **Catálogo habitual listo** o en el selector, la estrella añade o quita favoritos. El icono del ojo oculta una opción; **Ocultos** permite volver a mostrarla, incluso con **Mostrar todos los productos ocultos**. Ocultar no borra productos ni historia. Favoritos, ocultos y recientes pertenecen a ese navegador y acceso; no se sincronizan automáticamente con otro teléfono.

La recepción sin terminar se conserva en ese navegador para el mismo acceso y entorno, incluso tras cerrar sesión. Vuelve a **Recepciones** para continuar. El borrador no contiene tu contraseña ni sustituye una sesión iniciada.

Si se pierde la conexión o aparece un error al guardar, no des por confirmada la recepción. Usa **Reintentar misma recepción** o **Resolver confirmación pendiente**. Si la sesión venció, pulsa **Iniciar sesión de nuevo**, vuelve con el mismo acceso y recupera esa confirmación. **Cerrar resumen** solo cierra el diálogo: conserva la operación pendiente. No borres los datos del navegador para resolver una recepción de resultado incierto.

## Comprobación pendiente en el negocio

Después de la publicación autorizada, registrar esta comprobación con mercancía auténtica y sin crear compras o cobros de ensayo en producción:

- [ ] Anotar fecha, dispositivo, navegador y versión exacta mostrada al pie de la aplicación; contrastarla con el informe de publicación.
- [ ] En teléfono y tablet Android, abrir el selector, buscar un producto y comprobar que cantidad, costo y botones se alcanzan sin quedar tapados por el teclado.
- [ ] Registrar una llegada real, revisar su costo y verificar el número, las cajas y los lotes después de **Recepción guardada**.
- [ ] En una llegada posterior, comprobar el costo propuesto antes de aceptarlo o cambiarlo.
- [ ] Confirmar que favoritos y el borrador se recuperan en el mismo navegador y acceso.

La emulación de 390, 800 y 1366 píxeles no sustituye esta comprobación física. Tampoco acredita entrega de avisos push, uso de WhatsApp corporativo o impresión en la HP Smart Tank 215. Los PDF siguen siendo documentos comerciales, no facturas fiscales.

## Capturas de QA

[Móvil, 390 px](capturas/recepcion-v4-2/recepcion-390.png) · [Tablet emulada, 800 px](capturas/recepcion-v4-2/recepcion-800.png) · [Escritorio, 1366 px](capturas/recepcion-v4-2/recepcion-1366.png) · [Reintento con sesión vencida](capturas/recepcion-v4-2/reintento-401-390.png) · [Recepción confirmada](capturas/recepcion-v4-2/guardada-390.png).
