# Revisión previa a inventario operativo

Base revisada: Fase 1, commit `6c10243`. Se leyó el código real, el esquema, las migraciones y las pruebas; los informes anteriores se usaron como contexto. El catálogo persistente y su historial se conservan.

## Hallazgos y decisiones

1. **La salida agregada era un prototipo.** `packages/domain/src/index.ts`, función `sellIntactBlisters`, planificaba cajas abiertas y blíster restantes, pero no identificaba contenedores ni retiraba cajas vacías. La Fase 2 trabaja con identidades físicas por caja y blíster, dentro de una transacción. El prototipo anterior conserva sus pruebas y no procesa movimientos operativos.
2. **Libro y proyección necesitaban reconciliación.** `packages/database/src/schema.ts` definía `stock_balances` e `inventory_entries`, pero `0001_integrity.sql` solo impedía ciclos y doble conteo. Ahora las restricciones diferidas comparan el neto del libro con la proyección, y el último evento con cantidad, unidad, conteo, versión y estado físico. No se puede confirmar una modificación aislada del saldo.
3. **Había estados vacíos válidos para el modelo preliminar.** La validación inicial actuaba sobre saldos positivos y no exigía que un contenedor abierto tuviera contenido. Ahora se marca vacío al agotarlo, se excluye del resumen y se exige un padre compatible y abierto para contenido disponible.
4. **El snapshot del lote existía, pero no era inmutable.** La Fase 2 bloquea cambios de proveedor, variante, regla, configuración, costo, fecha y cantidad recibida. Solo avanza la versión del inventario con un nuevo evento. Editar el catálogo no cambia los lotes ya recibidos.
5. **Las reversas necesitaban una relación y una condición de seguridad.** Los movimientos iniciales no tenían referencia al movimiento revertido. Ahora se conserva `reversal_of` único, más estados anteriores y posteriores. Se permite revertir una sola vez el último movimiento del lote, siempre mediante un evento compensatorio. Los eventos anteriores con dependencias no se reescriben.
6. **El historial debía impedir también inserciones tardías.** Además de prohibir UPDATE y DELETE, una entrada solo puede insertarse en la misma transacción creadora de su movimiento y debe coincidir con sus snapshots. No se pueden agregar débitos o créditos a un evento ya confirmado.

La idempotencia de catálogo ya usaba bloqueo y huella del comando. Inventario conserva ese patrón, incluye al actor autenticado y bloquea el árbol antes de bloquear lote y saldos. La prioridad de consumo es usar blíster intactos disponibles antes de abrir otra caja.

## Cantidades que ya estaban correctamente separadas

El calibre era texto comercial y `counted_pieces` admitía `null`. Se conserva esta distinción: desconocido no es cero; 180 no son 180 frutas. Las medias cajas exigen conteo real y conservación exacta, por ejemplo 37 = 18 + 19. Los costos mantienen `NUMERIC` y cadenas decimales, sin aritmética monetaria binaria.

## Evidencia y límites

El baseline ejecutado por el integrador aprobó tipos, compilación, 11 pruebas unitarias y 13 escenarios de navegador/API/SQL antes de los cambios. La verificación de la Fase 2 se registra por separado tras ejecutar las nuevas pruebas. Esta revisión no convierte por sí sola el esquema comercial futuro en facturación, cobranza ni operación de producción.
