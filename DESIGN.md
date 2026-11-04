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
