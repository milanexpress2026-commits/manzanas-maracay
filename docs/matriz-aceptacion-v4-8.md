# Matriz de aceptación V4.8

Rama `feature/disponibilidad-v4-8`. El segundo candidato `8beac4429ea19c9ba921db7924786f41725516f8` aprobó 418 unitarias y 31/33 dirigidas; detectó el orden inestable de las líneas. La corrección y la conservación visual de BCV al vencer se integran en un tercer candidato. La tercera ejecución `6be915e` aprobó 419 unitarias, 34 dirigidas y 148/149 E2E; el fallo de orden de asignaciones se corrige con evidencia de auditoría FIFO. **Cuarta QA final PENDIENTE.** La columna de evidencia identifica pruebas escritas, no acredita su ejecución. Las unidades/typechecks dirigidas de implementación y los PASS históricos de V4.7 permanecen separados; no rellenan esta matriz automáticamente.

| Caso | Escenario                                                                | Evidencia automatizada                                                   | QA final  | Staging V4.8 | Producción V4.8 | Tablet/HP cuando aplique |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------- | ------------ | --------------- | ------------------------ |
| T01  | 5 + 4 = 9; escribir 10, 25 o 1000 y revisión bloqueada                   | A1 + I1; U2                                                              | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T02  | POST con 10 rechaza atómicamente; POST con 9 consumeFIFO 5 + 4           | A1; U2                                                                   | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T03  | Venta de 6 deja 3; venta de 3 acepta y de 4 rechaza                      | A1 (incluye POST 4 rechazado tras vender 6)                              | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T04  | Líneas duplicadas: 6 + 4 rechazan; 6 + 3 aceptan; reordenar/eliminar     | A1 + I2; U3 (reordenar y eliminar)                                       | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T05  | Identidad exacta: tradicional/granel roja/Gala/verde y PC                | A4 (Gala 150 tradicional/granel; roja/verde PC); U8                      | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T06  | 3 cajas de 5 blíster; 2 cajas + 6 o 5 blíster y orden inverso            | A2; U4                                                                   | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T07  | Manzana 100/113, aperturas previas y 4/5 blíster                         | A8 + A3; U6                                                              | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T08  | Forelle/Packham 125/135, empaques confirmados y medias pendientes        | A8; R1 (pera 130); U9                                                    | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T09  | Granel/kiwi caja + 3 o 2 medias y ausencia de recomposición              | A2; U7; R2 (media comercial)                                             | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T10  | Costo NULL y conocido; documentos históricos intactos                    | A5; U11; R3                                                              | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T11  | Dos sesiones: 7 + 7 y 5 + 4 sobre 9 cajas                                | A5 (dos sesiones concurrentes)                                           | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T12  | Dos pestañas, doble clic, replay y COMMIT con respuesta perdida          | I6 + A1/A5; R4 (otra pestaña, recarga y nueva sesión)                    | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T13  | Otro socio vende 7 mientras el formulario conserva 9                     | I3 (borrador 9; otro vende 7)                                            | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T14  | Sin stock, sin presentación, empaque pendiente y plantilla               | I4 + A6; U9; R5 (opciones virtuales sin materializar)                    | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T15  | Cantidades inválidas, límites 50/1000 y suma del carrito                 | I4 + A6; U12                                                             | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T16  | Última línea falla: rollback de venta, cobro, stock y auditoría          | A6 + I5                                                                  | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T17  | Precio manual USD 40, USDT/VES, crédito, recibos y reimpresión           | R6 + R7 + R8 + R9; A7 (PDF sin mutación)                                 | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T18  | Refresco por recepción/venta/foco; 390/800 y fecha visible               | I1 + I3 + I4 (390/800/1024/1440) + I5                                    | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T19  | FIFO histórico, compatibilidad, empaques 4/5/5 y precisión temporal      | A3; U1 + U5 + U10                                                        | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |
| T20  | 50 líneas, varias recepciones, cientos de cajas, latencia y solo lectura | A7 (50 líneas, 200 cajas, 4 recepciones, latencia); U13 (1.000 unidades) | PENDIENTE | PENDIENTE    | NO PUBLICADO    | PENDIENTE humano         |

[Diagnóstico y alcance](auditoria-v4-8.md). No se ejecutan fixtures comerciales en producción. Preview, confirmación y reimpresión deben distinguirse; solo la confirmación autorizada modifica mercancía.

## Alcance de los escenarios y límites

T01/T02 usan un SKU sintético aislado de caja completa para el escenario equivalente 5 + 4 = 9; no se presenta como una prueba literal de Gala calibre 80. Las opciones habituales reales Gala 100/113 y Forelle/Packham 125/135 se ejercitan por separado en A8. T05 compara Gala tradicional y granel con el mismo calibre 150, además de roja/verde a granel con PC. T03 incluye ahora el POST de cuatro rechazado después de vender seis; T13 conserva nueve en el borrador cuando otro socio vende siete.

El error de cantidad y la accesibilidad se prueban en navegador a 390, 800, 1024 y 1440 px. Eso no acredita teclado Android, tablet ni impresora HP físicos. La recarga exacta del recorrido humano «vender 6 y ver 3» queda para la verificación del propietario; A1 comprueba el residual mediante API. Reordenar/eliminar líneas se verifica en la unidad U3; no se atribuye una interacción de arrastre inexistente a la UI.

T17 depende también de la regresión comercial y de impresión incluida en la suite completa del candidato; los resultados históricos no la sustituyen. T20 registra `preview-performance` y exige menos de 15 segundos en el entorno QA aislado: no constituye una promesa de latencia para cualquier carga o dispositivo. Debe conservarse la medición de la ejecución final, además del log. Ningún caso comercial sintético se ejecuta en producción.

## Pruebas identificadas

Los identificadores siguientes corresponden a nombres concretos de pruebas en la fuente del candidato.

**A — [API de stock V4.8](../tests/e2e/stock-v48-api.spec.ts)**

- A1: «V4.8 T01–04 disponibilidad 5+4, rechazo 10 y FIFO 9; cuota 6+3 y residual 3».
- A2: «V4.8 T06/T09 cajas y fracciones comparten stock; ambos órdenes conservan las líneas».
- A3: «V4.8 T07/T19 históricos 4/5/5 no dependen del orden; fecha anterior rechazada».
- A4: «V4.8 T05 identidad exacta separa Gala tradicional y tres graneles con PC».
- A5: «V4.8 T10–12 dos sesiones 7+7 y 5+4, costo NULL conservado y replay exacto».
- A6: «V4.8 T14–16 contratos estrictos; fallo en última línea revierte factura, pago y stock».
- A7: «V4.8 T20 preview de 50 líneas/200 cajas es solo lectura y coincide con confirmación y PDF».
- A8: «V4.8 T07/T08 opciones reales: manzana 100/113 y pera Forelle/Packham 125/135 conservan remanentes y media pendiente».

**I — [UI de stock V4.8](../tests/e2e/stock-v48-ui.spec.ts)**

- I1: «V4.8 T01/T18: recepción abierta 5 + 4, exceso inmediato 10/25/1000 y máximo sin duplicar salida».
- I2: «V4.8 T04: dos líneas del mismo producto comparten las 9 cajas y conservan precios distintos».
- I3: «V4.8 T13: stock cambia de 9 a 2 mientras se revisa; primera confirmación vuelve a consultar sin enviar la venta».
- I4: «V4.8 T14/T15 {width}px: presentación obligatoria, cantidad estricta y cero existencias accesibles», parametrizada en 390/800/1024/1440.
- I5: «V4.8 T18: otra venta consume la última línea después del preview; rollback conserva la primera y permite corregir».
- I6: «V4.8 recuperación: COMMIT perdido con stock cero se recupera sin consultar ni exigir un nuevo preview».

**U — [Planificador puro](../tests/unit/sale-planner-v48.test.ts)**

- U1: «T19 conserva el orden SQL submilisegundo y la fecha exacta, sin reordenar por UUID».
- U2: «T01/T02 suma5+4, rechaza10 sin mutar y asigna9 FIFO5+4 con costoNULL».
- U3: «T04 compartecuota6+4/6+3, reordenar mantiene factibilidad y eliminar libera stock».
- U4: «T06 cajas y blíster usan recursoscompartidos enambosórdenes».
- U5: «T19 reserva cajasantesabrir; lotes4/5/5 admiten2cajas+5blísterindependientedelorden».
- U6: «T07 usa4/5históricos, remanentesantesapertura yno cuenta padreabierto».
- U7: «T09 mediascomerciales nocuentan comocajas yno se duplican».
- U8: «T05 identidad exactavariante/unidad; lotes ajenos noinflanmax».
- U9: «T08/T14 empaque pendiente, media no preparada y producto inexistente permanecen bloqueados».
- U10: «T19 salta presentación incompatible, conserva ordenFIFO yrechaza fecha anterior».
- U11: «T10 conserva residuo25/3 yNULL; simulaciones noalterancostos».
- U12: «T15 otroscarritosinviables dan maxnull y total>1000noaprueba».
- U13: «T20 agrupa50líneas/variasrecepciones y conserva paridad con1000unidades».

**R — Regresión que debe volver a aprobar sobre este candidato**

- R1 — [operation-v45-api.spec.ts](../tests/e2e/operation-v45-api.spec.ts): «V4.5 pera calibre130 no infiere blíster: exige confirmar empaque y conserva la elección».
- R2 — [packaging-phase3.spec.ts](../tests/e2e/packaging-phase3.spec.ts): «fracciones FIFO conservan el último decimal de costo y la mitad comercial no inventa piezas».
- R3 — [operation-v45-api.spec.ts](../tests/e2e/operation-v45-api.spec.ts): «V4.5 FIFO físico mixto conserva costo histórico, admite desconocido y restaura ambos orígenes».
- R4 — [commercial-recovery-v47.spec.ts](../tests/e2e/commercial-recovery-v47.spec.ts): «venta: COMMIT perdido, otra pestaña, recarga y nueva sesión recuperan el mismo folio sin duplicar stock».
- R5 — [receipt-v42-api.spec.ts](../tests/e2e/receipt-v42-api.spec.ts): «V4.2 opciones habituales son virtuales: no crean maestros, precios ni operaciones al consultarlas».
- R6 — [operation-v45-api.spec.ts](../tests/e2e/operation-v45-api.spec.ts): «V4.5 precio manual 40 y luego 43 sin price_items: snapshots, reintento y reversa no crean listas»; «V4.5 USDT 1:1 guarda referencia Bs informativa opcional y nunca cambia la moneda recibida»; «V4.5 Bs exactos liquidan sin residuo con fuente pactada; abonos eligen factura y no revalúan deuda».
- R7 — [operation-v45-ui.spec.ts](../tests/e2e/operation-v45-ui.spec.ts): «V4.5 venta manual {width}px con {method}: revisión, accesibilidad y moneda histórica»; «V4.5 USDT sigue disponible con equivalencia Bs no disponible; no envía una tasa inventada».
- R8 — [payment-methods-v4.spec.ts](../tests/e2e/payment-methods-v4.spec.ts): «cuatro métodos V4: {agreement} cobra VES en venta y abono con su snapshot exacto», acuerdos divisa/BCV.
- R9 — [document-printing-v47.spec.ts](../tests/e2e/document-printing-v47.spec.ts): «V4.7 confirmación y documentos {width}px: Carta, lectura y accesibilidad»; «V4.7 ventana de impresión por gesto y alternativa si el navegador bloquea el popup»; «V4.7 los documentos reales y sus errores privados nunca son caché ni HTML descargable».
