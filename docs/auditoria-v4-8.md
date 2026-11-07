# Auditoría de disponibilidad V4.8

## Estado y alcance

**En preparación; el candidato V4.8 todavía no está publicado ni tiene una ejecución integrada final.** Se continúa V4.7 desde el cierre documental `8b45383` en `feature/disponibilidad-v4-8`, conservando el runtime real `82cd5ab579fbbc50cf852774aca47847cc388fa5` y sus dieciséis migraciones. El estado histórico de trece migraciones incluido en el brief quedó superado por la publicación autorizada del 7/11/2026; véase [verificación V4.7](verificacion-v4-7.json).

El [brief V4.8](referencias/brief-disponibilidad-v4-8.txt) solicita corregir disponibilidad, cantidades, combinaciones de presentaciones y cambios concurrentes. La revisión general prioriza estos flujos, la continuidad de tasas y la simplicidad para los dueños. No se agregan funciones secundarias ni se promete ausencia absoluta de fallos.

## Diagnóstico reproducible

No se demostró que el servidor permita confirmar una sobreventa. La revisión encontró un bloqueo global de inventario dentro de la transacción, estado físico compartido entre líneas, restricciones SQL, rollback integral e idempotencia anterior al consumo. Teclear una cantidad excesiva no prueba que se haya vendido esa cantidad; no se atribuye una aceptación a un video que no se inspeccionó en esta sesión.

Se identificaron dos P1 que deben cerrarse mediante evidencia nueva:

- **Disponibilidad del carrito y comunicación:** el formulario usa máximos independientes por presentación y una suma por configuración/presentación. Esto no representa cajas, medias y blísteres que comparten mercancía. El campo permitía teclear sin presentación y la revisión dependía de una lectura que podía estar desactualizada.
- **Orden de planificación:** con cajas FIFO de 4, 5 y 5 blíster, procesar cinco blíster antes de dos cajas puede abrir dos cajas; reservar primero las dos cajas permite la combinación. Debe verificarse una planificación canónica compartida, conservando el orden del documento y la historia.

La implementación en curso usa un planificador físico puro común para previsualización y confirmación. Reserva cajas selladas antes de fraccionar; respeta la secuencia FIFO exacta de PostgreSQL y compara allí las fechas con precisión submilisegundo. El preview es autenticado y de solo lectura; no reserva mercancía ni genera movimientos. La confirmación vuelve a calcular bajo los bloqueos existentes. Un resultado de preview nunca sustituye esa comprobación final.

El formulario valida texto entero, consulta máximos condicionados al resto del carrito y refresca por edición, foco, visibilidad y caducidad. Revisión y primera confirmación consultan existencias frescas. Un comando ambiguo pendiente conserva sus bytes y clave y se recupera sin quedar bloqueado por el inventario que su propio COMMIT ya descontó.

## Tasas

La tasa BCV actual se recuperó y verificó en producción desde el histórico oficial, sin cambiar ventas o pagos. V4.8 incorpora una referencia visual de última tasa y prepara continuidad automática acotada hasta la siguiente fecha valor oficial conocida, solo con evidencia fresca. La fecha valor original se distingue del período operativo de continuidad. Ante una fuente desconocida o un intervalo no verificable, la referencia histórica no autoriza por sí sola un cobro VES. USD y USDT 1:1 siguen siendo independientes de una cotización informativa.

## Evidencia pendiente

La primera ejecución integrada del candidato `32823d49787b5a8f58b7ae4df2d9e2385e7b990c` aprobó tipos, builds y **418 unitarias**. El bloque dirigido terminó con **28/31 aprobadas**; la regresión completa y producción aislada no se ejecutaron después de ese fallo. Dos fixtures tomaban `fruitId` de la respuesta de creación de empaque, que no contiene ese campo; otra buscaba `Forelle` por igualdad exacta aunque el catálogo conserva `FORELLE`. Se corrigieron las pruebas para leer la identidad del catálogo y usar su normalización existente, sin cambiar el runtime. Se reforzaron además el POST de cuatro cajas tras vender seis de nueve, la separación tradicional/granel con calibre150, el conflicto con borrador de nueve y las pantallas1024/1440. La nueva ejecución final sigue pendiente; no se suman los resultados de corridas distintas como una sola suite aprobada.

Las unidades y typechecks dirigidos ejecutados durante la implementación no sustituyen el check, dirigido, regresión completa, producción aislada, staging y restauración del SHA final. La [matriz T01–T20](matriz-aceptacion-v4-8.md) se completará con resultados reales. No hay autorización operativa de un SHA V4.8 todavía. La publicación requiere presentar los resultados, respaldos y ventana concreta al propietario. Tablet Android y HP físicas permanecen pendientes de validación humana.
