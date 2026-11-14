# Rendimiento de impresión y recepción — V4.15

La mejora reduce el trabajo al imprimir y al ingresar mercancía. No cambia precios, tasas, acuerdos, documentos históricos ni cantidades disponibles. V4.15 está publicada con el runtime `501bd3bb06583535f9b3a79d00579721bb35fa1f`, después de la autorización operativa específica del propietario.

## Cambios

- PDF: derivado PNG proporcional de 256 px del logo oficial, con transparencia y sin alterar el original. A 48 puntos equivale a 384 ppp. Se utiliza en notas, comprobantes y recibos. Texto, paginación, razón social privada, dirección, firmas y BCV del día de la venta conservan su comportamiento.
- Recepción: una inserción por tabla para las cajas nuevas de cada lote, manteniendo un recipiente, saldo, asiento físico y asiento de costo por caja. La misma transacción conserva idempotencia, auditoría y reversa.
- Migración `0017_inventory_validation_scope`: limita las comprobaciones de árbol/estado/fracción al recipiente afectado, sus padres e hijos pertinentes. Conserva las restricciones diferidas, la serialización, el ledger y las comprobaciones de costos. No modifica filas ni las diecisiete migraciones anteriores.
- Formulario de recepción: obtiene el catálogo una sola vez y construye las opciones con la misma función pura utilizada en el servidor. Evita descargar otra representación expandida y consultar dos veces los mismos maestros. Recarga los datos después de cambios o conflictos.
- Navegación: los enlaces del menú dejan de precargar pantallas ajenas a la operación actual, reduciendo competencia por la conexión en la tablet. Conservan navegación de Next y controles de sesión.

## Medición inicial

El 14/11/2026, dos descargas autenticadas de una nota existente en producción pesaron 2.105.409 bytes y tardaron 3.511/3.338 ms desde la estación de trabajo. Las lecturas de catálogo, inventario y ventas respondieron normalmente entre 0,18 y 0,53 segundos. No se registraron operaciones sintéticas en producción. La observación del servidor no mostró presión de memoria ni consultas esperando bloqueos; no representa toda la jornada.

Comparación local con las mismas notas sintéticas:

| Filas | Antes, bytes | Después, bytes | Antes, generación ms | Después, generación ms |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2.105.230 | 126.593 | 2.505 | 372 |
| 19 | 2.110.789 | 132.152 | 1.607 | 170 |
| 50 | 2.119.588 | 140.949 | 1.836 | 197 |

Son mediciones locales, no una promesa de latencia de la conexión o impresora física. El documento de una fila pesa aproximadamente un 94 % menos. Las pruebas verifican contenido, geometría, firmas y presupuesto de tamaño; las vistas renderizadas de primera y última página conservaron el diseño.

La recepción sintética de 100/500 cajas en una base nueva tardó 850/8.524 ms antes del cambio y 328/2.288 ms durante el recorrido completo final. Las 500 cajas requieren aproximadamente un 73 % menos de tiempo en este ensayo. Una ejecución dirigida anterior midió 253/2.191 ms. Los registros, saldos, asientos físicos, costos y reintentos se comprobaron por cada caja; ninguna prueba de velocidad introduce stock en el sistema real.

## Verificaciones

- Tipos, API/web compiladas y 460 pruebas unitarias aprobadas.
- 170/170 recorridos completos aprobados en una ejecución con base nueva, `cfc121d744967f6ffd282ace`, terminada el 14/11/2026 a las 11:33:54 UTC. Servidor de QA detenido y control de la base local anterior intacto. Capturas y evidencias guardadas en privado.
- Migraciones desde bases nuevas y versiones históricas aprobadas, ejecución `73e849f3df97838b3b71218e`: dieciocho migraciones, datos/referencias preservados y bases temporales propias retiradas. Staging comprueba específicamente 17→18 y todas sus filas.
- Análisis del código indexado: 837 archivos, sin coincidencias con los secretos locales conocidos ni los patrones comprobados. No equivale a una garantía de ausencia de toda información sensible.
- Cinco controles del operador de migración y cinco controles de la recuperación acotada aprobados.
- El respaldo cifrado previo de V4.14 en la computadora y el mismo VPS fue verificado y restaurado en aislamiento, el 14/11/2026 a las 11:21:09 UTC.

Los 14 controles de producción aislada y los 21 controles de acceso/PDF de staging aprobaron. Staging está saludable con el mismo SHA, 18 migraciones, ambos respaldos restaurados y el recolector reanudado. La recuperación conservó las filas y los servicios originales; no repitió la migración. Las mediciones de PDF en el servidor se registran en `verificacion-v4-15.json`. El mismo paquete fue publicado con aprobación expresa; producción está saludable y sus documentos reales están verificados.

## Riesgos y conservación

La validación acotada debe rechazar ciclos, doble conteo de ancestros y descendientes, hijos bajo cajas cerradas y padres abiertos que perdieron su último contenido. Se añaden casos que activan cada restricción específica y revierten la transacción. Las pruebas existentes cubren medias de cuatro/cinco blísteres, granel, ventas simultáneas, movimientos, costos desconocidos y reversas. Las recepciones grandes comprueban las cuatro proyecciones por caja y el reintento idempotente.

Se descartó un ensayo de compresión manual de JSON: la versión instalada de Next elimina `Content-Encoding` al reenviar una respuesta y las pruebas detectaron que resultaba incompatible. No se incluye en el cambio final. Se conservan sus fallos de QA como evidencia, junto con un error inicial del fixture que añadía un campo no admitido a `open-box`; se corrigió el fixture sin relajar el contrato.

En staging, la primera activación se detuvo al observar un contenedor temporal del recolector de producción. La migración ya había terminado con todas las filas preservadas y ambos respaldos restaurados. La recuperación conserva el fallo original, vuelve a exigir el comparador original de servicios ajenos y no repite la migración. Una comprobación previa de recuperación usaba las conexiones esperadas de servicios activos sobre servicios detenidos; se corrigió para exigir únicamente sus conexiones activas y mantener el control completo después del arranque. No se detuvo ni modificó el recolector de producción.

Alcance ejecutado: respaldo cifrado nuevo en los destinos autorizados, pausa de los procesos propios, migración 17→18 y comparación íntegra de filas antes/después; acceso y tablet conservados. Sin cambios de DNS, Caddy ni proyectos ajenos. No fue necesaria una recuperación de producción ni se repitió la migración.

## Publicación completada

V4.15 publicada y verificada: runtime `501bd3bb06583535f9b3a79d00579721bb35fa1f`, rama `fix/rendimiento-v4-15`, PR #16. Autorización específica `call_e8227142e808436ba7a2923aa0c790b5` recibida y aplicada. PDF aproximadamente 94 % menor, recepción agrupada/validación acotada y catálogo único sin precargas de otros menús. Migración0017 (17→18), todas las filas conservadas durante la pausa, acceso/tablet intactos, recolector reanudado y 21 controles HTTPS reales PASS. Documentos Carta/A4 reales con nombre/RIF/dirección/BCV/firmas comprobados y venta intacta; navegación de tablet instalada simulada y catálogo único verificados. Tipos/builds, 460 unitarias, 170/170 E2E, 14 casos de producción aislada, migraciones y staging PASS. Respaldo posterior cifrado PC/VPS restaurado a `2026-11-14T12:53:54.839993+00:00`. Sin DNS/Caddy ni otros proyectos. No repetir publicación, migración ni vaciados. Cerrar y abrir la app instalada para cargar la interfaz; velocidad física pendiente del propietario. Ver `docs/rendimiento-v4-15.md` y `docs/verificacion-v4-15.json`.

Los tiempos reales de descarga de los documentos y navegación simulada están en `verificacion-v4-15.json`. No se registraron ventas ni recepciones sintéticas en producción. Las mediciones de 500 cajas pertenecen exclusivamente a QA.
