# Rendimiento de impresión y recepción — V4.15

La mejora reduce el trabajo al imprimir y al ingresar mercancía. No cambia precios, tasas, acuerdos, documentos históricos ni cantidades disponibles. Producción conserva V4.14 hasta la autorización operativa específica del propietario.

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

La recepción sintética de 100/500 cajas en una base nueva tardó 850/8.524 ms antes del cambio. Los resultados definitivos, recorridos completos y staging se registrarán al terminar las verificaciones. Ninguna prueba de velocidad introduce stock en el sistema real.

## Riesgos y conservación

La validación acotada debe rechazar ciclos, doble conteo de ancestros y descendientes, hijos bajo cajas cerradas y padres abiertos que perdieron su último contenido. Se añaden casos que activan cada restricción específica y revierten la transacción. Las pruebas existentes cubren medias de cuatro/cinco blísteres, granel, ventas simultáneas, movimientos, costos desconocidos y reversas. Las recepciones grandes comprueban las cuatro proyecciones por caja y el reintento idempotente.

Se descartó un ensayo de compresión manual de JSON: la versión instalada de Next elimina `Content-Encoding` al reenviar una respuesta y las pruebas detectaron que resultaba incompatible. No se incluye en el cambio final. Se conservan sus fallos de QA como evidencia, junto con un error inicial del fixture que añadía un campo no admitido a `open-box`; se corrigió el fixture sin relajar el contrato.

Publicación prevista: respaldo cifrado nuevo en los destinos ya autorizados, pausa breve de los procesos propios, migración 17→18 y comparación íntegra de filas antes/después; conservación de acceso y tablet. Sin cambios de DNS, Caddy ni proyectos ajenos. No se hace rollback automático de la base: la recuperación se decide con el respaldo verificado y la evidencia de la fase exacta.
