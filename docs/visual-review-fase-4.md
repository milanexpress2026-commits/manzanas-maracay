# Revisión visual — fase 4

## Alcance comprobado

Se inspeccionaron las seis capturas finales del ensayo local HTTPS del 5 de noviembre de 2026, ejecución `67a94e711faec9abdb1bff9a`, entre 06:00:41 y 06:02:18 UTC, con Chromium y `MM_APP_ENV=production`. El origen fue `https://localhost:3143`, con base nueva exclusiva de QA y acceso efímero. **No son capturas del VPS publicado ni de datos comerciales del negocio.** El sello de release identifica el build de ensayo y no acredita un commit de producción desplegado.

El ensayo final aprobó **12 de 12 escenarios**: dos de producción sin activar en 17,5 segundos, cuatro de interfaz en 38,7 segundos y seis de API en 19,3 segundos, con limpieza de la base temporal confirmada. El estado inicial comprobó 20 tablas comerciales vacías y owner de migración limitado. Los escenarios vacíos comprueban autenticación, cierre completo del árbol `/demo`, respuestas anónimas denegadas, bloqueo de mutaciones y presentación adaptable. Tras la activación exclusiva de QA, la interfaz verifica persistencia de sesión y revocación al salir, operación comercial completa, error recuperable del resumen y consentimiento para cambiar la configuración push simulada. El recorrido comercial tardó 18,5 segundos. Son resultados locales; no acreditan un despliegue remoto.

## Inicio vacío en cuatro anchos

Las capturas son de página completa. La altura del PNG puede superar la altura del viewport porque la guía inicial contiene siete pasos y se desplaza verticalmente.

| Viewport    | Captura completa                                            | Resultado visual observado                                                                                                                               |
| ----------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 390 × 844   | [390 × 2821 px](capturas/fase4/preparacion-vacia-390.png)   | Cabecera compacta con logo oficial, menú y cierre de sesión. Indicadores en una columna, guía y avisos apilados; textos y enlaces sin recortes.          |
| 800 × 1000  | [800 × 2329 px](capturas/fase4/preparacion-vacia-800.png)   | Navegación lateral, indicadores en tres columnas y guía principal a todo el ancho disponible. El enlace de inventario ocupa dos líneas sin superponerse. |
| 1024 × 1000 | [1024 × 1945 px](capturas/fase4/preparacion-vacia-1024.png) | Navegación persistente; guía e información complementaria en dos columnas. Etiquetas, importes y acciones caben en sus paneles.                          |
| 1440 × 1000 | [1440 × 1891 px](capturas/fase4/preparacion-vacia-1440.png) | Jerarquía de título, resumen y preparación clara; mayor espacio de lectura y panel lateral de inventario, comprobantes y BCV.                            |

En las cuatro vistas aparecen inventario y ventas en cero y saldo USD 0,00 porque el servidor confirmó la base vacía. No se muestran esas cantidades como sustituto de una consulta fallida. El aviso «Operación en preparación» explica por qué las acciones de escritura están deshabilitadas; los enlaces permiten consultar los módulos. Se conserva la identidad verde bosque, rojo y crema, con el logo proporcionado por el negocio.

Las cuatro capturas actuales muestran el resultado BCV no disponible y el bloqueo de VES. No se presenta una tasa inventada. Los comprobantes se describen como documentos comerciales, no facturas fiscales.

No se observaron solapamientos, cortes de contenido ni desbordamiento horizontal del documento. La guía es larga en móvil y puede plegarse desde «Pasos para empezar»; no bloquea la navegación. El nombre extenso del acceso de QA se abrevia en la cabecera de escritorio sin desplazar el botón de salida.

## Primera venta y resumen después del abono

El escenario crea proveedor, producto, empaque confirmado, recepción de 20 cajas con costo USD 25 por caja, listas de precios y cliente sintéticos en la base aislada. Completa una venta a crédito de dos cajas por USD 80, sin pago inicial, y un abono posterior de USD 30. Comprueba por API el costo de mercancía USD 50, saldo USD 50 y un único pago; descarga ambos PDF y comprueba su formato.

| Vista, viewport 390 × 844        | Captura completa                                  | Resultado observado                                                                                                                                                                                                             |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comprobante después del abono    | [390 × 2261 px](capturas/fase4/venta-qa-390.png)  | Confirmación del abono, costo FIFO, recibo descargable y cuenta con venta USD 80, costo USD 50, ganancia bruta USD 30 y saldo USD 50. Acciones apiladas y WhatsApp deshabilitado porque el cliente de ensayo no tiene teléfono. |
| Inicio con operaciones guardadas | [390 × 1684 px](capturas/fase4/inicio-qa-390.png) | 18 cajas cerradas, USD 50 por cobrar y una venta. La guía pasa a «Continúa con tu negocio», con siete pasos completos y detalle plegado. No queda el mensaje de inventario vacío.                                               |

La tabla del comprobante se desplaza dentro de su panel; el PNG estático muestra las primeras columnas, mientras el resumen inferior permite leer los importes completos. El documento no desborda horizontalmente. La captura conserva visible el enlace «Saltar al contenido» con foco tras la auditoría de accesibilidad: es la ayuda de teclado, no una notificación comercial. El campo «Operador» aún muestra su identificador interno; se registró como mejora de claridad pendiente para mostrar un nombre comprensible, sin alterar la integridad del comprobante.

## Accesibilidad y comprobaciones de interacción

El escenario vacío ejecutó axe con reglas WCAG 2 A/AA y 2.1 AA a 390 y 1440 px sin infracciones detectadas. También verificó que el documento no desborda en los cuatro anchos, ausencia de errores de página y emulación de movimiento reducido. La prueba del acceso persistente pasó la auditoría axe a 390 px, comprobó la opción inicialmente desmarcada, cookie segura de 30 días, reapertura del acceso en un contexto nuevo y rechazo de una cookie anterior después de cerrar sesión. El estado de sesión se mantuvo solo en memoria del ensayo.

Durante los ensayos previos se corrigieron dos defectos comprobados: la lista descriptiva del resumen contenía un enlace fuera de `dt`/`dd`, y la respuesta de `/demo` podía comenzar con HTTP 200 antes de `notFound()`. El resumen conserva ahora estructura semántica válida; el límite de ruta responde 404 antes del render también para RSC. Los escenarios de producción vacía actuales comprueban ambas correcciones.

Los dos selectores ajustados antes de esta ejecución no cambiaron la interfaz: el empaque de caja completa autoselecciona «Caja» y deja deshabilitado el selector porque no hay otra presentación; la prueba comprueba ese estado. El aviso de error se identifica dentro del contenido principal para distinguirlo del anunciador de rutas de Next, manteniendo la comprobación del mensaje y de la ausencia de cifras falsas. Ambos escenarios pasaron al repetirse. La venta móvil también pasó axe con los mismos criterios y la comprobación de ancho del documento; el recorrido no registró errores de página.

## Límites y seguimiento

Esta revisión corresponde a Chromium local con tamaños de viewport emulados. No acredita una prueba física en tablet Android, teclado de pantalla, lector de pantalla, Safari/iOS, entrega de notificaciones ni apertura de WhatsApp corporativo. Los ensayos push simulan permiso y suscripción; no envían notificaciones a dispositivos reales.

Las capturas estáticas y la emulación de movimiento reducido no miden fluidez ni rendimiento de una tablet. No se reutilizan las mediciones de fase 3 como resultado de fase 4. Falta verificar por separado la versión real desplegada y completar la comprobación en el dispositivo del negocio.
