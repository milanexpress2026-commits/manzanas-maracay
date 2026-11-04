# Revisión visual y accesibilidad

La dirección proviene de las cuatro imágenes entregadas: verde oscuro, rojo manzana, crema, navegación lateral y formularios claros. El propietario entregó el logo oficial el 4 de noviembre de 2026 para reemplazar el encabezado tipográfico provisional. Se preserva su arte original; las referencias conceptuales permanecen separadas. Véase [activos de marca](brand-assets.md).

## Verificaciones

- Interfaz de escritorio a 1440 px y teléfono a 390 px en Chromium.
- Auditoría automática con axe-core para WCAG 2 A/AA y 2.1 AA.
- Tabulación, apertura/cierre de formularios, retorno de foco, etiquetas y nombres accesibles de acciones de icono.
- Estado vacío, búsqueda sin resultados, error de carga, recuperación y fallo de guardado sin perder el formulario.
- Pestañas vinculadas a un panel real; navegación accesible por teclado.
- Reducción de movimiento; foco visible y fuente Manrope alojada localmente.
- Contraste del texto secundario y adaptación de tabla/editor/formulario.
- Página de desconexión con acción de reintento, sin prometer guardado sin conexión.
- Tras incorporar el logo oficial, se repitieron tipos, compilación, 11 pruebas unitarias y 13 escenarios de navegador/API/SQL. La revisión automática de escritorio y teléfono no detectó infracciones; se verificó además que el logo carga sin conexión.

## Hallazgos corregidos

- Las pestañas apuntaban inicialmente a un panel ausente: se incorporó `TabsContent`.
- El pie tenía contraste insuficiente: se oscureció el color.
- Las etiquetas y los datos del empaque eran demasiado pequeños: se amplió su tamaño.
- En el teléfono, la cuarta pestaña quedaba recortada: la navegación se convirtió en cuatro columnas sin contadores redundantes.
- El formulario preserva el texto y muestra el error cuando falla una escritura; se conserva su clave de idempotencia al reintentar el mismo contenido.

## Límites

Una auditoría automática sin infracciones no equivale a certificación de accesibilidad. No se ensayaron lector de pantalla real, Safari/iOS ni todos los tamaños posibles. La navegación de módulos posteriores es texto informativo, no botones que simulan acciones.

La revisión de código utilizó la [fuente de Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md), consultada durante esta fase. Las capturas de pruebas usan datos aislados de prueba; las capturas finales del catálogo local contienen únicamente las configuraciones iniciales del propietario.
