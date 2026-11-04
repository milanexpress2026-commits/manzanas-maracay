# Revisión visual y accesibilidad

La dirección proviene de las cuatro imágenes entregadas: verde oscuro, rojo manzana, crema, navegación lateral y formularios claros. El propietario entregó el logo oficial el 4 de noviembre de 2026 para reemplazar el encabezado tipográfico provisional. Se preserva su arte original; las referencias conceptuales permanecen separadas. Véase [activos de marca](brand-assets.md).

## Evidencia conservada de fase 1

- Interfaz de escritorio a 1440 px y teléfono a 390 px en Chromium.
- Auditoría automática con axe-core para WCAG 2 A/AA y 2.1 AA.
- Tabulación, apertura/cierre de formularios, retorno de foco, etiquetas y nombres accesibles de acciones de icono.
- Estado vacío, búsqueda sin resultados, error de carga, recuperación y fallo de guardado sin perder el formulario.
- Pestañas vinculadas a un panel real; navegación accesible por teclado.
- Reducción de movimiento; foco visible y fuente Manrope alojada localmente.
- Contraste del texto secundario y adaptación de tabla/editor/formulario.
- Página de desconexión con acción de reintento, sin prometer guardado sin conexión.
- Tras incorporar el logo oficial, se repitieron tipos, compilación, 11 pruebas unitarias y 13 escenarios de navegador/API/SQL. La revisión automática de escritorio y teléfono no detectó infracciones; se verificó además que el logo carga sin conexión.

## Hallazgos corregidos en fase 1

- Las pestañas apuntaban inicialmente a un panel ausente: se incorporó `TabsContent`.
- El pie tenía contraste insuficiente: se oscureció el color.
- Las etiquetas y los datos del empaque eran demasiado pequeños: se amplió su tamaño.
- En el teléfono, la cuarta pestaña quedaba recortada: la navegación se convirtió en cuatro columnas sin contadores redundantes.
- El formulario preserva el texto y muestra el error cuando falla una escritura; se conserva su clave de idempotencia al reintentar el mismo contenido.

## Verificación de fase 2

La ejecución final confirmó tipos, compilación, 23 pruebas unitarias y 32 escenarios de navegador/API/PostgreSQL. Dentro de esa suite, [operations-ui.spec.ts](../tests/e2e/operations-ui.spec.ts) comprueba los nuevos módulos y [catalog.spec.ts](../tests/e2e/catalog.spec.ts) conserva las comprobaciones del catálogo. Los resultados funcionales completos están en [entrega-fase-2.md](entrega-fase-2.md).

- Navegación móvil a 390 × 844: panel de módulos, selección de Inventario, Recepciones y Proveedores, título correcto, carga terminada y etiqueta `ENTORNO DE PRUEBAS`.
- Sin desbordamiento horizontal de documento en esos módulos; inventario se comprueba también a 1440 × 1000.
- Axe-core sin infracciones de los criterios WCAG 2 A/AA y 2.1 AA evaluados en los tres módulos a tamaño móvil y en inventario a tamaño escritorio. El catálogo se mantiene evaluado en ambos tamaños.
- Proveedor creado, editado y desactivado desde teléfono; el estado y el teléfono corregido persisten tras recargar.
- Recepción de dos líneas, revisión antes de confirmar y conservación del formulario ante pérdida de la respuesta. El reintento mantiene la misma clave y devuelve una sola recepción.
- Detalle de lote DEMO, apertura de caja y blíster, conteo de 37 piezas, rechazo de 18 + 20, preparación de 18 + 19, ajuste y reversa. La recarga conserva cantidades e historial.
- Error explícito al fallar la consulta de inventario y recuperación mediante `Reintentar`; sin errores de página en el escenario de navegación auditado.
- [auth.spec.ts](../tests/e2e/auth.spec.ts) comprueba redirección de visitantes al acceso, inicio de sesión, persistencia al recargar y cierre de sesión. No confundir estas pruebas locales con una verificación HTTPS externa ya terminada.

## Capturas reales de fase 2

Se inspeccionaron las diez capturas de fase 2 y las tres del catálogo actualizado: logo completo, formularios y navegación legibles, datos DEMO diferenciados y contenido sin desbordamiento horizontal. Se corrigió el encuadre de la preparación de media caja: una captura de página completa producía demasiado fondo detrás del diálogo. Las imágenes finales usan el viewport del paso de revisión de 37 = 18 + 19, con el botón Confirmar visible sin pulsarlo.

Las capturas proceden del entorno local autenticado. El lote DEMO muestra tres cajas recibidas y un blíster retirado: dos cajas cerradas y cuatro blíster intactos disponibles. El capturador `scripts/capture-phase2.mjs --production` reutiliza ese lote al repetirse; no registra otra salida ni confirma la media caja para producir imágenes. La etiqueta `ENTORNO DE PRUEBAS` se comprueba aparte en los E2E del entorno de pruebas.

| Vista                       | Escritorio                                               | Teléfono                                          |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Acceso                      | [1440 × 1000](capturas/fase2-login-escritorio.png)       | [390 × 844](capturas/fase2-login-movil.png)       |
| Proveedores                 | [1440 × 1000](capturas/fase2-proveedores-escritorio.png) | [390 × 844](capturas/fase2-proveedores-movil.png) |
| Recepción, página completa  | [1440 × 1323](capturas/fase2-recepcion-escritorio.png)   | [390 × 1753](capturas/fase2-recepcion-movil.png)  |
| Inventario, página completa | [1440 × 3032](capturas/fase2-inventario-escritorio.png)  | [390 × 4496](capturas/fase2-inventario-movil.png) |
| Revisión de media caja      | [1440 × 1000](capturas/fase2-media-caja-escritorio.png)  | [390 × 844](capturas/fase2-media-caja-movil.png)  |

Las imágenes `modelo-*` de `docs/referencias` siguen siendo conceptos del propietario. Las capturas del catálogo se actualizaron con la interfaz actual; los PNG anteriores se conservan en el historial Git de fase 1. Sus cifras y conclusiones históricas permanecen en aquella entrega. Las imágenes de fase 2 proceden de datos de demostración; no documentan ventas, cuentas por cobrar ni una tasa BCV.

## Límites

Una auditoría automática sin infracciones no equivale a certificación de accesibilidad. No se ensayaron lector de pantalla real, Safari/iOS ni todos los tamaños posibles. Catálogo, Inventario, Recepciones y Proveedores son rutas operativas; los módulos comerciales futuros no se presentan como acciones funcionales. Tampoco hay guardado de operaciones sin conexión.

La revisión de código de fase 1 utilizó la [fuente de Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md). Su consulta histórica no constituye una auditoría nueva de todas las vistas. Las capturas de pruebas usan datos aislados de prueba; las del catálogo local contienen las configuraciones iniciales del propietario.
