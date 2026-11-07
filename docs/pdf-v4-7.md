# Documentos comerciales V4.7: composición y evidencia

La nota de entrega usa Carta (612 × 792 pt) por defecto y admite A4. Conserva el logo oficial, márgenes de 34 pt (aproximadamente 12 mm), texto negro/gris, precios unitarios con cuatro decimales y totales con dos. No muestra costos, márgenes ni referencias de precio. Esta evidencia corresponde al compositor local y a datos sintéticos; no demuestra publicación ni impresión física.

## Contenido y reimpresión

La mercancía, presentación comercial, precio, condición, cliente y fecha pactada original proceden del documento guardado. El saldo y el abonado se identifican como **actuales al imprimir**, con fecha/hora de Caracas. En el comprobante de venta, un vencimiento modificado aparece por separado como vigente. La nota de entrega omite el historial detallado de pagos para mantenerse compacta; el recibo de abono conserva su importe, conversión/referencia histórica y saldo posterior a ese abono.

Cada página conserva empresa, folio, numeración y las marcas DEMO/anulación aplicables. Las entregas anuladas dicen **ANULADO - NO ENTREGAR** en todas sus páginas. Totales, abonado, saldo y campos de entrega/firma forman un único bloque. Si hace falta, el último renglón acompaña ese bloque a la página siguiente. Las filas usan altura real y no se parten; una descripción excepcionalmente alta pasa a un bloque de ancho completo con etiquetas, manteniendo el renglón íntegro y el mismo tamaño de letra.

Las fuentes estándar admiten español y los símbolos de moneda utilizados. Los grafemas que no admiten se muestran explícitamente por código, por ejemplo `[U+1F34E]`, sin sustituirlos silenciosamente por `?`. El dato guardado no cambia. Se eliminan controles e instrucciones direccionales invisibles; etiquetas HTML, scripts y direcciones escritas por usuarios se dibujan como texto, sin acciones PDF, anotaciones ni imágenes remotas.

## Resultados ejecutados

- **15/15 pruebas unitarias PDF PASS**, ejecución final local del 6 de noviembre de 2026. Log: `.local/pdf-qa/v4-7/unit-final.log`.
- **TypeScript global PASS** después de implementar la firma y composición; la verificación integral del candidato pertenece a la entrega general.
- **12 PDF sintéticos, 37 páginas renderizadas**, con extracción real de texto mediante pdfplumber 0.11.9 y render Poppler. Verificación de filas completas/ordenadas, suma de subtotales, tamaño, folio, paginación, advertencias y ausencia de intersecciones entre cajas de palabras: PASS.
- **Revisión visual de las 11 páginas públicas** de las notas de 1, 25 y 50 renglones: PASS. También se inspeccionaron el caso Unicode, el recibo USDT y primera/última página del anulado. No se afirma revisión visual manual de las 37 páginas; todas sí pasaron extracción y geometría automatizadas.
- **Tablet Android / HP Smart Tank 215: PENDIENTE** para estos documentos. Abrir o descargar el PDF no acredita impresión.

| Renglones de entrega | Páginas Carta | Total USD sintético | Filas, suma y geometría |
| --- | ---: | ---: | --- |
| 1 | 1 | 40,00 | PASS |
| 5, descripciones largas | 2 | 604,00 | PASS |
| 10, descripciones largas | 2 | 1.215,50 | PASS |
| 15, descripciones largas | 3 | 1.834,50 | PASS |
| 25, descripciones largas | 4 | 3.095,00 | PASS |
| 35, descripciones largas | 5 | 4.385,50 | PASS |
| 50, descripciones largas | 6 | 6.377,50 | PASS |

Las cinco muestras adicionales son comprobante de 25 renglones, recibo USDT, entrega anulada de 25, entrega A4 de 25 y Unicode. Las pruebas incluyen el límite justo antes/después de un salto, 1000 unidades y cifras grandes sin partir importes, descripciones sin espacios, grafemas no disponibles, controles, notas literales hostiles, 60 abonos con entrega compacta y comparación del objeto original antes/después de reimprimir. No se ejecutó ninguna operación contra una base de datos para producir estas muestras.

## Artefactos

- [Nota de 1 renglón](capturas/impresion-v4-7/entrega-01.pdf), [página 1](capturas/impresion-v4-7/entrega-01-1.png).
- [Nota de 25 renglones](capturas/impresion-v4-7/entrega-25.pdf): [1](capturas/impresion-v4-7/entrega-25-1.png), [2](capturas/impresion-v4-7/entrega-25-2.png), [3](capturas/impresion-v4-7/entrega-25-3.png), [4](capturas/impresion-v4-7/entrega-25-4.png).
- [Nota de 50 renglones](capturas/impresion-v4-7/entrega-50.pdf): [1](capturas/impresion-v4-7/entrega-50-1.png), [2](capturas/impresion-v4-7/entrega-50-2.png), [3](capturas/impresion-v4-7/entrega-50-3.png), [4](capturas/impresion-v4-7/entrega-50-4.png), [5](capturas/impresion-v4-7/entrega-50-5.png), [6](capturas/impresion-v4-7/entrega-50-6.png).
- [Extracción, hashes y geometría automáticas](capturas/impresion-v4-7/verificacion-automatica.json).
- [Inspección visual y hashes de las imágenes revisadas](capturas/impresion-v4-7/revision-visual.json).

La fecha impresa en las muestras es fija (`2026-11-06T16:34:56Z`) para repetir las pruebas. No es una fecha de operación real. El reporte automático deja la revisión visual como pendiente porque un script no puede certificarla; el archivo de revisión visual separado registra la inspección efectivamente realizada.

## Reproducir sin servicios

```text
npx vitest run tests/unit/commerce-pdf.test.ts
npx tsx scripts/capture-commerce-pdfs.ts
python scripts/verify-commerce-pdfs.py --poppler-dir <directorio-bin-de-Poppler>
```

El último comando necesita `pdfplumber` en el Python de QA. En esta ejecución se usaron las herramientas del runtime de Codex; no se añadió una dependencia a la aplicación. Los doce PDF, su texto extraído y diagnósticos de composición quedan en `.local/pdf-qa/v4-7`; solo las tres notas solicitadas y sus once imágenes se publican bajo `docs/capturas/impresion-v4-7`. Los scripts no leen `.env`, credenciales ni documentos reales.

La medición suma avances de glifos reales: las fuentes estándar de `pdf-lib` emiten texto sin el kerning que descuenta su estimación habitual de ancho. La extracción detectó inicialmente 0,32 pt de exceso en el pie; se corrigió la medición y se repitieron pruebas, generación, extracción y render. No se relajó el margen horizontal para aceptar ese defecto.

La seguridad de sesión, encabezados HTTP, descarga y ausencia de mutaciones al consultar endpoints se verifica aparte en las pruebas API/E2E. Estas pruebas de composición no sustituyen esa integración ni la validación humana de la impresora.
