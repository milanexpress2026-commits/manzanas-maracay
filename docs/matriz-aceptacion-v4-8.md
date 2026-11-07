# Matriz de aceptación V4.8

Estado del **candidato final**: no congelado; pruebas integradas nuevas NO EJECUTADAS todavía. Hay unidades/typechecks dirigidos aprobados durante implementación, con ejecución final pendiente. Los PASS históricos de V4.7 se conservan en su propia evidencia y no rellenan esta matriz automáticamente.

| Caso | Escenario | QA final | Staging V4.8 | Producción V4.8 | Tablet/HP cuando aplique |
| --- | --- | --- | --- | --- | --- |
| T01 | 5 + 4 = 9; escribir 10, 25 o 1000 y revisión bloqueada | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T02 | POST con 10 rechaza atómicamente; POST con 9 consumeFIFO 5 + 4 | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T03 | Venta de 6 deja 3; venta de 3 acepta y de 4 rechaza | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T04 | Líneas duplicadas: 6 + 4 rechazan; 6 + 3 aceptan; reordenar/eliminar | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T05 | Identidad exacta: tradicional/granel roja/Gala/verde y PC | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T06 | 3 cajas de 5 blíster; 2 cajas + 6 o 5 blíster y orden inverso | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T07 | Manzana 100/113, aperturas previas y 4/5 blíster | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T08 | Forelle/Packham 125/135, empaques confirmados y medias pendientes | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T09 | Granel/kiwi caja + 3 o 2 medias y ausencia de recomposición | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T10 | Costo NULL y conocido; documentos históricos intactos | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T11 | Dos sesiones: 7 + 7 y 5 + 4 sobre 9 cajas | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T12 | Dos pestañas, doble clic, replay y COMMIT con respuesta perdida | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T13 | Otro socio vende 7 mientras el formulario conserva 9 | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T14 | Sin stock, sin presentación, empaque pendiente y plantilla | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T15 | Cantidades inválidas, límites 50/1000 y suma del carrito | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T16 | Última línea falla: rollback de venta, cobro, stock y auditoría | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T17 | Precio manual USD 40, USDT/VES, crédito, recibos y reimpresión | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T18 | Refresco por recepción/venta/foco; 390/800 y fecha visible | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T19 | FIFO histórico, compatibilidad, empaques 4/5/5 y precisión temporal | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |
| T20 | 50 líneas, varias recepciones, cientos de cajas, latencia y solo lectura | NO EJECUTADO | PENDIENTE | NO PUBLICADO | PENDIENTE humano |

[Diagnóstico y alcance](auditoria-v4-8.md). No se ejecutan fixtures comerciales en producción. Preview, confirmación y reimpresión deben distinguirse; solo la confirmación autorizada modifica mercancía.
