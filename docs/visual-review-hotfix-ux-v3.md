# Revisión visual del hotfix UX V3

Revisión local del 5 de noviembre de 2026, con datos sintéticos y Chromium de Playwright. Estas imágenes no proceden de producción ni acreditan una prueba física en Android. Se revisaron dos rondas de composición y una comprobación final de los importes formateados en español. Las imágenes enlazadas corresponden al último build de la interfaz.

## Antes y después

La [pantalla anterior de contado a 390 px](capturas/ux-v3/antes-contado-390.png) mostraba fecha/hora, recordatorio, monto pagado y método de texto libre en el recorrido habitual. La [pantalla nueva de contado](capturas/hotfix-ux-v3/contado-390.png) reúne cliente, productos, precio acordado y cobro total automático. Las fechas aparecen solo cuando queda deuda; los detalles secundarios se abren en «Más opciones». El acuerdo de precio permanece independiente de contado/crédito.

El logo oficial, verde oscuro, rojo y fondo crema se conservan. La revisión encontró controles legibles y separados, subtotal junto al precio y un botón principal identificable. Una segunda revisión independiente confirmó legibilidad del logo y del botón, sin superposición, a 390 y 1440 px; señaló una diferencia de formato entre total y cobro que quedó corregida y verificada en las nuevas capturas. En escritorio el cobro ocupa una columna lateral; en móvil y tablet estrecha continúa debajo de los productos, sin cubrir el formulario con una barra fija. La revisión de crédito confirmó que un abono cero oculta moneda y método y mantiene separadas la fecha acordada y el recordatorio.

Los estados anterior y nuevo contienen datos distintos; sus alturas no constituyen una medida de productividad ni de tiempo real de venta. El formulario nuevo sigue requiriendo desplazamiento en móvil.

## Evidencia final

| Ancho del viewport | Contado                                           | Crédito                                           | Alto de contado | Ancho del documento |
| ------------------ | ------------------------------------------------- | ------------------------------------------------- | --------------: | ------------------: |
| 390 px             | [Captura](capturas/hotfix-ux-v3/contado-390.png)  | [Captura](capturas/hotfix-ux-v3/credito-390.png)  |        1.997 px |              390 px |
| 800 px             | [Captura](capturas/hotfix-ux-v3/contado-800.png)  | [Captura](capturas/hotfix-ux-v3/credito-800.png)  |        1.771 px |              800 px |
| 1024 px            | [Captura](capturas/hotfix-ux-v3/contado-1024.png) | [Captura](capturas/hotfix-ux-v3/credito-1024.png) |        1.365 px |             1024 px |
| 1440 px            | [Captura](capturas/hotfix-ux-v3/contado-1440.png) | [Captura](capturas/hotfix-ux-v3/credito-1440.png) |        1.373 px |             1440 px |

Los ocho estados tienen comprobación de ausencia de desbordamiento horizontal y cero infracciones detectadas por axe. Cada PNG tiene un JSON de medidas al lado. Esto complementa la inspección visual y no garantiza por sí solo accesibilidad completa.

El [vídeo de contado a 390 px](capturas/hotfix-ux-v3/venta-contado-390.webm) registra el recorrido hasta el comprobante. Se verificaron fotogramas intermedios y finales del archivo generado. Los datos son de QA y el cobro no mueve dinero externo. El [vídeo del alta de producto](capturas/ux-v3/alta-producto-qa.webm) y las capturas de catálogo se mantienen en su carpeta específica.

## Verificación funcional relacionada

La validación concluyente del candidato `8bed277fd2a216f2e4305ebd404bad2faeeacb49` aprobó **74 de 74 pruebas E2E**, en 10 minutos, sin reintentar casos en esa ejecución. El registro es `.local/ux-v3/e2e-candidate.log`. Incluye los nueve casos de ventas, la recuperación del catálogo ante 503, cinco anchos del alta, ambos vídeos, integridad, FIFO y reintentos de comandos. El caso de crédito parcial comprueba abono inicial de USD 10, saldo de USD 30, eliminación de fechas al quedar pagado, ambos PDF e inventario descontado una sola vez.

También pasaron **13 de 13 pruebas de producción aislada**: dos de preparación vacía/acceso, una de catálogo vacío y primera venta, cuatro de interfaz y seis de API. Ejecución `56e4bb9e49ba629ce9ecfa43`, del 5 de noviembre de 2026, 15:37:35–15:40:23 UTC; registro `.local/ux-v3/production-candidate.log`. La base temporal quedó retirada y el servidor local detenido. Es evidencia del modo producción bajo HTTPS local; no prueba operaciones en el negocio ni un despliegue remoto.

En ese ensayo, el recorrido completo y el vídeo usan **390 × 844 px**. Se inspeccionaron el [catálogo realmente vacío](capturas/ux-v3/catalogo-vacio-real.png), la [revisión del primer producto](capturas/ux-v3/vacio-manzana-revision.png) y la [primera venta de contado](capturas/ux-v3/vacio-primera-venta-contado.png): entradas y botones legibles, sin desbordamiento horizontal. El [vídeo del recorrido vacío a venta](capturas/ux-v3/catalogo-vacio-y-venta-qa.webm) conserva la evidencia. La fixture crea Manzana y Pera, recibe dos cajas, vende una y comprueba que volver a descargar el PDF no genera otra salida. Los datos siguen siendo sintéticos aunque la interfaz de producción no muestre la banda DEMO.

Historial conservado: una ejecución anterior terminó 71/72 por una lectura de catálogo fallida; el dirigido posterior terminó 13/14 por un selector de alerta ambiguo. Ambos fallos se corrigieron y sus casos pasaron en la ejecución completa de 74 pruebas. Los logs anteriores `.local/ux-v3/e2e-final.log` y `.local/ux-v3/e2e-catalog-sales-final.log` permanecen disponibles. Tras estas pruebas se ajustó únicamente el parser del colector USDT y sus unitarias; ese cambio tiene una comprobación de tipos, unitarias y build posterior, sin presentarlo como otra ejecución completa del navegador.

La prueba de vencimiento utiliza una respuesta HTTP sintética solo para la interfaz: conserva el importe de la revisión, bloquea una confirmación vencida y exige actualizar y revisar de nuevo. La API real rechaza la cotización de prueba no registrada y mantiene intacto el inventario. No acredita una cotización financiera real. La interfaz identifica USDT como «Binance P2P · compra · referencia general» y aclara que no filtra banco/monto ni garantiza una oferta.

Quedan fuera de esta revisión el teclado virtual y el uso táctil en el Android físico del negocio, la recepción real de push, el perfil corporativo de WhatsApp y la impresión en la HP Smart Tank 215. La publicación del hotfix en staging y cualquier promoción a producción requieren su evidencia operativa separada.
