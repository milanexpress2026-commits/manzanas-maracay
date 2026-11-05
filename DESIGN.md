# Sistema visual

Derivado de las cuatro referencias entregadas; superficie de operación cotidiana. Se conserva el verde profundo de navegación, el rojo para crear y el crema de fondo. La fase 2 incorpora proveedores, recepción e inventario real por lote junto con el catálogo. No reproduce indicadores de ventas o tasas de las imágenes que pertenecen a módulos futuros.

## Tokens

- Verde bosque #123c2c, verde hoja #276342, rojo manzana #b92f3c, crema #f7f6f0, tinta #20372c, gris oliva #627269.
- Manrope variable, alojada localmente. Títulos 30/38 px, cuerpo 14/22 px, controles 14/20 px; móvil cuerpo 15/23 px.
- Espaciado: 4, 8, 12, 16, 24, 32, 48 px. Bordes 1 px; radios controles 8 px, paneles 14 px.
- Foco visible verde de 2 px; error rojo con texto e icono; éxito verde con texto; carga y vacío explícitos.

## Catálogo

Navegación lateral de 232 px, encabezado ligero, título y acción Nueva configuración. Un panel principal contiene pestañas, búsqueda y tabla. Un panel lateral explica el empaque seleccionado y permite editarlo. En móvil navegación compacta y registros verticales, formulario a ancho completo.

La firma visual es la composición de blíster del empaque seleccionado: exactamente tantos iconos como contiene la configuración, sin insinuar una cantidad de frutas. Las cantidades y etiquetas salen de PostgreSQL. No hay logo inventado, fotos decorativas, métricas ni tasas ficticias.

## Marca oficial

El logo suministrado por el propietario el 4 de noviembre de 2026 reemplaza la firma tipográfica provisional. Se conserva completo, con sus letras, personaje, tractor y frutas, sin recortarlo, deformarlo ni redibujarlo. En navegación y encabezado se adapta su tamaño al espacio disponible; los iconos de instalación se derivan del mismo archivo. Original, variantes y reglas de uso en [activos de marca](docs/brand-assets.md).

## Operación de fase 2

La navegación ofrece Catálogo, Inventario, Recepciones y Proveedores. En escritorio permanece lateral; en teléfono se abre en un panel con enlaces identificables y se cierra al seleccionar el módulo. El acceso tiene una pantalla propia, y las vistas operativas requieren sesión. Staging y pruebas muestran `ENTORNO DE PRUEBAS`; los lotes de demostración conservan su etiqueta DEMO.

La recepción organiza cada producto en una región propia con configuración, cajas, costo USD y empaque del lote. Antes de confirmar muestra una revisión de los datos. Inventario separa cajas cerradas, cajas abiertas con contenido, blíster intactos, medias cajas y piezas contadas; presenta equivalencias con su nombre, sin confundirlas con unidades físicas adicionales. Desconocido se muestra como desconocido, no como cero.

El detalle del lote reúne sus contenedores, cantidades e historial. Las acciones explican el recipiente afectado y piden motivo. Preparar media caja muestra conteo inicial, piezas preparadas y remanente; exige una suma exacta y luego una confirmación. Ajustes y reversas describen lo que se corregirá. Los vacíos permanecen en el historial, fuera del selector de ajustes sobre existencia activa.

## Estados y revisión

Los formularios conservan errores y datos si falla la red. Se desactivan durante guardado; reintentar el mismo contenido conserva la clave de idempotencia. Una respuesta perdida no debe duplicar una recepción. Conflictos de edición requieren recargar. Los diálogos permiten revisar antes de confirmar y conservan navegación por teclado y foco visible. Se respeta prefers-reduced-motion.

Las capturas y las comprobaciones reales se registran en [revisión visual](docs/visual-review.md), separadas de los modelos conceptuales. La corrección del conteo se prueba contra API/PostgreSQL; una captura no sustituye esa verificación.

## Fase 3: recorrido público y operación comercial

La raíz presenta la marca oficial y dos entradas claras: explorar la demostración o entrar al negocio. `/demo` y sus cinco módulos contienen ejemplos escritos en el frontend; no consumen las API privadas ni muestran clientes, inventario o tasas reales. El amarillo suave identifica la demo. Los datos internos se consultan en rutas autenticadas, con el catálogo en `/catalogo` y navegación ampliada a ventas, clientes y cobranza.

La composición usa el verde bosque como ancla y el rojo manzana para la acción principal. El logo permanece completo sobre una superficie verde, sin filtros ni deformaciones. Los números usan variantes tabulares. La portada tiene una jerarquía editorial amplia; los formularios internos mantienen etiquetas y resúmenes visibles, paneles sobrios y espacio suficiente para leer importes. A 390 px los formularios se apilan, las métricas pasan a dos columnas y las tablas conservan sus relaciones mediante desplazamiento dentro de su panel. Las vistas se adaptan también a 800, 1024 y 1440 px.

El empaque controla las opciones de la interfaz: caja completa, mitades comerciales o blíster con preparación por conteo. Variedad, calibre, peso fijo y blíster pendientes no se rellenan con cantidades supuestas. Los precios USD promocional y normal son explícitos por presentación; la recepción conserva precios por defecto y solo permite cambiarlos tras elegir esa acción. La venta diferencia referencia y precio pactado, muestra el saldo y exige revisar antes de descontar mercancía. Un crédito sin pago no genera un asiento de cero.

Los abonos muestran todos los comprobantes pendientes y su reparto explícito. No se aplica un exceso por su cuenta. La cobranza separa la fecha pactada del recordatorio interno, conserva el historial y abre WhatsApp únicamente al pulsar el botón y tras volver a consultar el saldo. La suscripción push explica el alcance de una sola tablet y exige confirmación para reemplazar el dispositivo existente. Sin VAPID habilitado se ofrece el centro de cobranza como alternativa, sin pedir permiso de notificaciones.

## Movimiento de fase 3

Se usan CSS y Radix existentes; no se agregó una librería de animación. Los diálogos entran en 220 ms con escala inicial 0,97 y opacidad; salen en 140 ms. La curva es `cubic-bezier(.23,1,.32,1)`. El hover de navegación está limitado a puntero fino; pestañas, indicador activo y mensajes de guardado no tienen animaciones repetidas. Las transiciones nombran propiedades concretas y los movimientos usan transformación/opacidad. `prefers-reduced-motion` suprime desplazamiento y duración perceptible. Los diálogos restauran el foco al control que los abrió, incluso cuando se controlan desde estado sin un `DialogTrigger`.

Revisión de código siguiendo la skill local `review-animations` (Emil Kowalski, MIT; procedencia en docs/skills.md):

| Antes de revisar                                     | Resultado aplicado                                       | Motivo                                                  |
| ---------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Salida con `ease-in`                                 | Curva de salida rápida común                             | La respuesta comienza de inmediato.                     |
| Animación de pestañas, indicador activo y mensajes   | Eliminada                                                | Son interacciones frecuentes y no necesitan movimiento. |
| Transiciones de colores y movimiento sin curva común | Transformación con curva explícita; colores instantáneos | Reducir trabajo visual y mantener consistencia.         |
| Diálogos controlados sin referencia al disparador    | Restauración de foco conectada al elemento de apertura   | Permitir continuar operando con teclado.                |

Las capturas de fase 2 conservan la referencia anterior. La suite UI de fase 3 genera capturas reales en `docs/capturas/fase3`; los resultados y el vídeo se documentan una vez ejecutados y revisados. Esta especificación describe decisiones y no sustituye esa verificación visual.

La ejecución final de la fase 3 produjo 30 capturas sin hallazgos axe ni desbordamiento y un vídeo de 17,56 s inspeccionado. La comparación con fase 2, las correcciones móviles y los límites verificados están en [revisión visual de fase 3](docs/visual-review-fase-3.md). Veredicto de movimiento: aprobado para el recorrido Chromium evaluado, con navegación por teclado y movimiento reducido comprobados.
