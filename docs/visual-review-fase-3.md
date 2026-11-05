# Revisión visual — fase 3

La interfaz se verificó en Chromium real el 4 de noviembre de 2026. La suite integrada terminó con 53 escenarios E2E correctos; el capturador posterior produjo 30 vistas a 1440 y 390 px y un vídeo real de 17,56 segundos. Sus 30 auditorías axe no encontraron infracciones de los criterios WCAG 2 A/AA y 2.1 AA evaluados, desbordamiento horizontal del documento ni errores de página. El [reporte automático](capturas/fase3/revision-automatica.json) permite revisar cada vista.

Las vistas públicas usan ejemplos sintéticos incluidos en el frontend. Las capturas internas muestran el estado real de la base local, incluidos los estados vacíos de ventas y cobranza; el capturador no creó clientes, recepciones, ventas ni abonos. La [venta móvil del escenario E2E](capturas/fase3/venta-interna-390.png) procede de una base de pruebas separada: crédito de USD 80, abono de USD 30 y saldo de USD 50, sin duplicados tras perder ambas respuestas de confirmación.

## Antes y después

| Aspecto            | Antes: fase 2                                                                                                                                                                       | Después: fase 3                                                                                                                                                            | Cambio visible                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada al negocio | [Acceso privado](capturas/fase2-login-escritorio.png)                                                                                                                               | [Portada pública](capturas/fase3/inicio-1440.png), [teléfono](capturas/fase3/inicio-390.png)                                                                               | Logo oficial protagonista, recorrido claro y entradas separadas a demostración y operación.                                                                                 |
| Catálogo           | [Catálogo de la revisión f9b532b](https://github.com/milanexpress2026-commits/manzanas-maracay/blob/f9b532b75c1ffce668571dc7db0ed20b5a52c36f/docs/capturas/catalogo-escritorio.png) | [Catálogo actual](capturas/fase3/interno-catalogo-1440.png), [teléfono](capturas/fase3/interno-catalogo-390.png)                                                           | Modalidad contextual, Kiwi sin variedad ficticia, granel y cajas completas; pendientes explícitos y precios separados por presentación.                                     |
| Recepción          | [Formulario de fase 2](capturas/fase2-recepcion-escritorio.png)                                                                                                                     | [Formulario actual](capturas/fase3/interno-recepciones-1440.png), [teléfono](capturas/fase3/interno-recepciones-390.png)                                                   | Hora de Venezuela inicializada y total de costo; actualización explícita de precios al seleccionar producto. El caso E2E de precios parciales verifica su guardado atómico. |
| Inventario         | [Lote de fase 2](capturas/fase2-inventario-escritorio.png)                                                                                                                          | [Inventario actual](capturas/fase3/interno-inventario-1440.png), [teléfono](capturas/fase3/interno-inventario-390.png)                                                     | Conserva existencias históricas y añade modalidades y equivalencias comerciales identificadas. No convierte calibre en fruta contada.                                       |
| Ventas y cobros    | Módulos futuros sin operación comercial                                                                                                                                             | [Nueva venta](capturas/fase3/interno-ventas-nueva-1440.png), [teléfono](capturas/fase3/interno-ventas-nueva-390.png), [cobranza](capturas/fase3/interno-cobranza-1440.png) | Referencia y precio pactado, pago inicial, saldo, fecha pactada y recordatorio diferenciados. Estado BCV no disponible visible.                                             |

## Recorrido público y evidencia de movimiento

El [vídeo de navegación](capturas/fase3/recorrido-demo.webm) muestra la portada, navegación entre módulos, filtrado de Kiwi y apertura/cierre de comprobantes de ejemplo. Se verificaron fotogramas del inicio, catálogo y recibo. No es un montaje de modelos ni contiene una operación real.

| Módulo de demostración | Escritorio                                          | Teléfono                                          |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Inicio                 | [1440 px](capturas/fase3/demo-1440.png)             | [390 px](capturas/fase3/demo-390.png)             |
| Catálogo               | [1440 px](capturas/fase3/demo-catalogo-1440.png)    | [390 px](capturas/fase3/demo-catalogo-390.png)    |
| Inventario             | [1440 px](capturas/fase3/demo-inventario-1440.png)  | [390 px](capturas/fase3/demo-inventario-390.png)  |
| Recepción              | [1440 px](capturas/fase3/demo-recepciones-1440.png) | [390 px](capturas/fase3/demo-recepciones-390.png) |
| Ventas                 | [1440 px](capturas/fase3/demo-ventas-1440.png)      | [390 px](capturas/fase3/demo-ventas-390.png)      |
| Cobranza               | [1440 px](capturas/fase3/demo-cobranza-1440.png)    | [390 px](capturas/fase3/demo-cobranza-390.png)    |

Los anchos 800 y 1024 px también se comprobaron en `tests/e2e/phase3-ui.spec.ts`. Sus capturas se encuentran en la misma carpeta. Las tablas que requieren más ancho se desplazan dentro de su panel; tienen región con nombre, foco por teclado y contorno visible. El documento completo no se desplaza horizontalmente.

## Hallazgos corregidos

| Hallazgo                                                                  | Corrección y verificación                                                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Textos pequeños sin contraste suficiente en tarjeta BCV                   | Color más oscuro sobre el verde suave; axe correcto en móvil y escritorio.                                                          |
| Etiqueta accesible absoluta escapaba de la tabla desplazable              | Contenedor con posición relativa, sin ocultar ni eliminar la etiqueta. Ancho de documento correcto.                                 |
| Resumen comercial imponía el ancho mínimo de sus dos columnas en teléfono | Columna `minmax(0,1fr)`, hijos que pueden reducirse y resumen de una columna a tamaño móvil.                                        |
| Tabla de ejemplo sin controles no podía desplazarse por teclado           | Región con `tabIndex=0`, nombre accesible y foco visible.                                                                           |
| Fecha de recepción solo se completaba tras recibir foco                   | Inicialización al montar la pantalla con la hora de Venezuela; el primer envío permite revisar.                                     |
| Editor exigía inventar precios para formatos pendientes                   | Los pares vacíos se omiten; si se escribe un importe se exige completar su par. E2E de precio de caja y recepción parcial correcto. |
| Movimiento frecuente en pestañas e indicador activo                       | Eliminado; diálogos cortos con curva rápida, hover solo en puntero fino y movimiento reducido respetado.                            |

La revisión de animaciones queda aprobada para el código y recorrido Chromium comprobados. Se conservan los límites del ensayo: no es una certificación general de accesibilidad, no incluye lector de pantalla físico ni Safari/iOS, y no acredita entrega de push en una tablet real. La demostración nunca afirma disponer de una tasa BCV verificada cuando no la hay.

## Medición básica de rendimiento

Se midió `/demo` en el build de producción local con Chromium sin interfaz, dos contextos nuevos por ancho y caché de navegador deshabilitada. En las cuatro navegaciones se aplicaron CPU 4× más lenta, 100 ms de latencia y descarga de 200.000 bytes/s (aproximadamente 1,6 Mbps). El [registro de resultados](capturas/fase3/rendimiento-basico.json) conserva las muestras y la configuración; `scripts/measure-phase3-performance.mjs` permite repetirlas sobre un servidor ya iniciado.

| Ancho | Muestra | Encabezado visible | DOMContentLoaded | Solicitudes JS | JS transferido | Cuerpo JS codificado |
| --- | --- | --- | --- | --- | --- | --- |
| 1440 px | 1 | 1179 ms | 1045 ms | 10 | 180.124 bytes | 177.124 bytes |
| 1440 px | 2 | 1091 ms | 1062 ms | 10 | 180.124 bytes | 177.124 bytes |
| 390 px | 1 | 1021 ms | 1008 ms | 10 | 180.124 bytes | 177.124 bytes |
| 390 px | 2 | 380 ms | 911 ms | 10 | 180.124 bytes | 177.124 bytes |

El encabezado se entrega desde el servidor y puede aparecer antes de `DOMContentLoaded`; su visibilidad no mide hidratación completa ni disponibilidad de todos los controles. Los bytes corresponden a los recursos `.js` observados hasta que la red quedó inactiva, incluidos los cargados anticipadamente. Son cuatro observaciones bajo emulación sobre el mismo equipo: no sustituyen mediciones de una tablet física, de Safari ni de la conexión al VPS, y no se aplicó un umbral de aprobación arbitrario.

## Verificación externa de la versión publicada

La versión `phase3-ef3d64616313` se comprobó en un navegador nuevo contra el sitio publicado el 5 de noviembre de 2026 a las 00:41 UTC. El [registro externo](verificacion-fase3-browser.json) confirma respuesta 200 en las siete rutas públicas, respuesta 401 en cuatro intentos anónimos a operaciones privadas (GET, POST y PATCH), acceso interno con cookie segura y revocación de la sesión al salir.

Se inspeccionaron las capturas reales de staging a [1440 px](capturas/fase3/staging-fase3-1440.png) y [390 px](capturas/fase3/staging-fase3-390.png). El sello corresponde a esa versión; la advertencia de demostración, los datos de ejemplo y el estado BCV no disponible permanecen visibles. La vista móvil distribuye las métricas en dos columnas y apila los paneles sin recortes ni solapamientos apreciables. No se detectaron problemas visuales nuevos en estas dos capturas. Esta comprobación externa no añade mediciones de velocidad: las cuatro muestras de rendimiento de la sección anterior siguen correspondiendo al entorno local, no al VPS ni a un dispositivo Android físico.
