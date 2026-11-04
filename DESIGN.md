# Sistema visual

Derivado de las cuatro referencias entregadas; superficie de operación cotidiana. Se conserva el verde profundo de navegación, el rojo para crear y el crema de fondo. La tabla y el editor reemplazan los indicadores de ventas de las imágenes porque esta fase solo maneja catálogo.

## Tokens

- Verde bosque #123c2c, verde hoja #276342, rojo manzana #b92f3c, crema #f7f6f0, tinta #20372c, gris oliva #627269.
- Manrope variable, alojada localmente. Títulos 30/38 px, cuerpo 14/22 px, controles 14/20 px; móvil cuerpo 15/23 px.
- Espaciado: 4, 8, 12, 16, 24, 32, 48 px. Bordes 1 px; radios controles 8 px, paneles 14 px.
- Foco visible verde de 2 px; error rojo con texto e icono; éxito verde con texto; carga y vacío explícitos.

## Catálogo

Navegación lateral de 232 px, encabezado ligero, título y acción Nueva configuración. Un panel principal contiene pestañas, búsqueda y tabla. Un panel lateral explica el empaque seleccionado y permite editarlo. En móvil navegación compacta y registros verticales, formulario a ancho completo.

La firma visual es la composición de blíster del empaque seleccionado: exactamente tantos iconos como contiene la configuración, sin insinuar una cantidad de frutas. Las cantidades y etiquetas salen de PostgreSQL. No hay logo inventado, fotos decorativas, métricas ni tasas ficticias.

## Estados y revisión

El editor mantiene errores y datos si falla la red. Se desactiva durante guardado. Conflictos de edición requieren recargar. Foco vuelve al disparador al cerrar. Se respeta prefers-reduced-motion.
