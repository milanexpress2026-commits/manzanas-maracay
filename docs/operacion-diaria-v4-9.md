# Operación diaria V4.9 — publicada

Producción y staging usan el runtime `e4edd2385614c41673209b20dd431df95444b10a`. La publicación conservó todas las filas y las **16 migraciones**; no ejecutó DDL. Después se realizó, por separado, el reinicio operativo solicitado por el propietario. [Abrir la aplicación](https://manzanas.ganamosclub.net/login).

## Cambios para los socios

- Nueva venta no pide fecha ni hora: toma el instante del servidor al confirmar y lo muestra en **America/Caracas**. El reloj del teléfono y el tiempo empleado en preparar el formulario no convierten una venta nueva en una operación futura. El reintento conserva su identidad y recupera una operación confirmada antes de generar otra hora.
- Fruta, variedad, calibre y empaque se completan en un formulario. **Agregar calibre a este producto** precarga el producto existente; permite crear el calibre y confirmar su empaque sin alterar lotes anteriores.
- Las tasas se consultan al volver a la aplicación y cada minuto visible. El reloj de cotización usa el instante del servidor y tiempo transcurrido. Se conserva la cotización revisada, el acuerdo comercial y la validación al confirmar.
- Navegación con entrada de pantalla de 180 ms y respuesta del menú de 110–160 ms. Se desactiva con movimiento reducido; no añade dependencias ni bloquea controles. Se aplicaron Impeccable y Motion Designer y las [guías de Vercel](https://vercel.com/design/guidelines).

## Reinicio ejecutado

Se vaciaron mercancía, recepciones/compras, movimientos y existencias, ventas, abonos y saldos derivados, además de avisos pendientes asociados. Se conservaron productos, variedades, calibres, empaques, clientes, proveedores, usuario, contraseña, configuración, tasas, almacén y tablet registrada. La auditoría y los recibos idempotentes permanecen como historia. Las sesiones anteriores se revocaron y los borradores del período anterior quedaron separados.

El reinicio aprobó primero un ensayo sobre una restauración aislada, incluyendo repetición idempotente. En producción hubo un respaldo cifrado externo nuevo y restaurado con los escritores detenidos, una transacción de alcance explícito y comprobaciones posteriores de integridad y conservación. El respaldo **posterior al reinicio** fue restaurado y verificado el `2026-11-09T01:31:05.612233+00:00`. Se conserva copia cifrada en la computadora autorizada y en el VPS; no se incluyen secretos ni datos privados en el repositorio.

Los socios deben iniciar sesión nuevamente una vez con el acceso habitual. Luego pueden empezar en **Recepciones**. [Guía breve de uso](manual-socios-v4-9.md).

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Tipos, compilación y pruebas unitarias | PASS; 421 unitarias |
| Batería E2E completa | 152/153; se conserva el fallo 503 de la venta de 50 líneas/200 cajas |
| Repetición puntual, mismo runtime | 2/2 PASS, incluyendo confirmación y PDF; no se modifica la aserción ni la aplicación |
| Producción aislada | 13/13 PASS |
| Migraciones históricas | Fresh 16, 13→16, 14→16 y 15→16 PASS |
| Recorrido comercial staging | 29/29 PASS |
| Acceso real y lecturas posteriores al reinicio | 21/21 PASS, con disponibilidad sin escrituras |
| PDF real existente, antes del reinicio | 5/5 PASS; Carta/A4, sin crear negocio |
| Interfaz real | 390/800 px, hora automática, alta de calibre y movimiento reducido PASS |
| Respaldo posterior | Cifrado PC/VPS y restauración aislada PASS |

Las primeras ejecuciones detectaron un permiso de lectura no concedido para audit_events; se corrigió leyendo el marcador desde command_receipts, sin ampliar permisos. Se actualizaron dos aserciones de fixture/refresco automático. Una repetición adicional usó artefactos compilados antiguos y otra marcó al navegador como desconectado al usar network=none; ambos ensayos fallidos se conservan y quedaron sustituidos por comprobaciones sobre la fuente compilada exacta y una red interna propia de QA. La primera comprobación visual posterior registró una aserción fallida sin detalle; las revisiones posteriores aprobaron con el mismo runtime y se conservaron por separado. Las capturas finales esperan el estado estable de las animaciones. El primer recorrido de staging se interrumpió por SSH; se reanudó con las mismas claves y terminó aprobado, sin duplicados.

La evidencia distingue ejecuciones: **no afirma 153/153 en una sola corrida**. Los dispositivos Android y la impresora HP físicos siguen requiriendo comprobación humana; no se atribuye a la emulación una prueba física. Los recursos de QA históricos se conservaron. [Evidencia agregada](verificacion-v4-9.json) · [PR #10](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/10).

Capturas sintéticas: [celular](capturas/operacion-v4-9/calibre-390.png) y [tablet](capturas/operacion-v4-9/calibre-800.png). No muestran datos de los socios.
