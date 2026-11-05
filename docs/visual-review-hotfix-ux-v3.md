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

La ejecución completa registrada en `.local/ux-v3/e2e-final.log` terminó con 71 de 72 pruebas aprobadas. Pasaron los ocho casos nuevos de ventas existentes en esa ejecución: cuatro anchos, crédito sin abono y cobro posterior USDT, regreso al borrador, vencimiento de cotización y vídeo de contado. El fallo restante fue una lectura del catálogo que dejó visible su alerta y el botón de alta deshabilitado.

Después del manejo específico del error de conexión y del ajuste de formato, se repitieron las dos especificaciones de catálogo y ventas. El log `.local/ux-v3/e2e-catalog-sales-final.log` registra 13 aprobadas de 14: los nueve casos de ventas y los cuatro recorridos anteriores de catálogo pasaron, incluido su vídeo. El caso adicional de crédito comprueba abono inicial de USD 10, saldo de USD 30, eliminación de fechas al quedar pagado, ambos PDF e inventario descontado una sola vez. El único fallo de esta repetición fue un selector de alerta ambiguo en la nueva prueba de recuperación 503; se acotó a la alerta del contenido principal, conservando las comprobaciones. Su repetición corregida se registra en la entrega general. Ninguna de estas dos ejecuciones se presenta aquí como una suite completa aprobada.

La prueba de vencimiento utiliza una respuesta HTTP sintética solo para la interfaz: conserva el importe de la revisión, bloquea una confirmación vencida y exige actualizar y revisar de nuevo. La API real rechaza la cotización de prueba no registrada y mantiene intacto el inventario. No acredita una cotización financiera real. La interfaz identifica USDT como «Binance P2P · compra · referencia general» y aclara que no filtra banco/monto ni garantiza una oferta.

Quedan fuera de esta revisión el teclado virtual y el uso táctil en el Android físico del negocio, la recepción real de push, el perfil corporativo de WhatsApp y la impresión en la HP Smart Tank 215. La publicación del hotfix en staging y cualquier promoción a producción requieren su evidencia operativa separada.
