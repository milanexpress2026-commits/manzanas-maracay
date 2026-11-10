# Auditoría de lógica V4.10

Continuación de V4.9 solicitada por el propietario: analizar el proyecto y corregir problemas de operación. La base es el runtime `e4edd2385614c41673209b20dd431df95444b10a`. El reinicio de existencias de V4.9 ya terminó: esta actualización **no vuelve a vaciar nada**.

## Hallazgos corregidos

1. **Deudas antiguas inaccesibles.** El formulario de abonos dependía de las últimas 200 ventas del cliente. Si una deuda quedaba fuera, el saldo general seguía incluyéndola pero no podía elegirse para cobrar. Ahora consulta comprobantes pendientes directamente, con páginas de 100, conserva lo escrito al cargar más y sitúa primero el comprobante desde el que se abrió el formulario.
2. **Búsqueda e historial incompletos.** La pantalla de ventas buscaba únicamente dentro de las últimas 200. Ahora busca por número o cliente en el servidor. Ventas, comprobantes del cliente y abonos permiten cargar más. Al cambiar de consulta o cliente, no se muestran como actuales los datos de la consulta anterior.
3. **Agenda incompleta.** «Hoy» y «Próximas» se calculaban después de recortar las primeras 200 deudas, ordenadas por fecha. Muchas vencidas podían esconder una cita de hoy. El filtro se aplica antes de paginar; el contador de hoy se calcula sobre todos los pendientes. Se conservan los criterios de fecha pactada y recordatorio, incluidos sus eventos de reprogramación.
4. **Confirmación lenta interrumpida.** El proxy cerraba cualquier solicitud a los 15 segundos y el navegador cerraba ventas/abonos a los 20, incluso si la operación seguía confirmándose. Las escrituras disponen ahora de 60 segundos en el proxy y 65 en el navegador; las lecturas mantienen 15. Un fallo de transporte sigue conservando la misma solicitud y clave. Este cambio amplía el margen; no demuestra que toda operación termine en un plazo fijo ni altera las protecciones de stock o dinero.
5. **Reintento anterior al reinicio.** El bloqueo de respuestas del período vaciado cubría ventas, abonos y recepciones, pero no ajustes, fraccionamientos, reprogramaciones, anulaciones o reversas. Esas operaciones también comprueban el marcador existente antes de devolver una confirmación guardada. Los recibos de clientes y proveedores conservados siguen siendo recuperables. No se crean marcadores ni se ejecuta otro reinicio.

## Recorridos examinados

| Área                       | Regla contrastada con código y pruebas                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo y recepción       | Identidad por fruta/variedad/calibre; confirmación de empaque; recepción sin costo ni proveedor obligatorio; snapshots e idempotencia.       |
| Existencias                | Disponibilidad del carrito completo, FIFO, recipientes terminales, conservación de fracciones y costo desconocido NULL.                      |
| Venta                      | Hora automática de servidor y presentación Caracas; precio manual; acuerdo divisa/BCV fijo; venta, stock y abono inicial en una transacción. |
| Cobranza                   | Suma de aplicaciones, cliente correcto, saldo suficiente, ausencia de duplicados, filtrado antes de paginación y fechas efectivas.           |
| Tasas                      | BCV/USDT verificadas, vigencia comprobada al confirmar, última BCV informativa, USDT recibido 1:1, cotización histórica conservada.          |
| Correcciones               | Anulación y reversa por eventos, dependencias de inventario preservadas y respuesta idempotente del período correcto.                        |
| Acceso y recuperación      | Sesión, borradores separados por período, recuperación de solicitudes ambiguas, protección entre pestañas y datos de prueba separados.       |
| Documentos y recordatorios | PDF comercial por venta/abono; nota de entrega; recordatorio pendiente revalidado antes de enviar; sin WhatsApp automático.                  |

## Verificación

La prueba nueva crea 202 ventas sintéticas en una base exclusiva, comprueba una deuda que quedó fuera de las últimas 200, busca esa venta desde el celular, carga el historial completo, conserva una aplicación al cargar otra página, confirma un único abono con respuesta demorada 25 segundos y consulta las agendas de hoy/próximas en celular y escritorio. Ver `tests/e2e/logic-audit-v410.spec.ts`.

Los 15 casos de `tests/unit/reset-replay-v410.test.ts` contrastan rechazo de respuestas anteriores al marcador, recuperación vigente sin repetir la operación y conservación de recibos de maestros.

Estado de preparación: pruebas unitarias base 421 PASS; nuevas pruebas de reinicio 15 PASS; tipos y compilación local PASS. El primer intento E2E local no inició PostgreSQL por restricciones del sandbox; al ejecutar con permisos se conservó el build anterior de la interfaz y falló la búsqueda antigua, reproduciendo el problema. Tras compilar, el siguiente intento llegó al formulario de abonos y falló por un selector de prueba que omitía «· USD»; se corrigió el selector. La evidencia de ese intento se conserva fuera del repositorio. Después de corregir el selector, el recorrido completo nuevo aprobó en 48,7 segundos (base aislada a45c36557ad12484760fdead, final 2026-11-09T02:47:46.721Z); PostgreSQL quedó detenido y la base local previa permaneció idéntica. La batería Linux del SHA `642ffae84efd23c14871acf2df7a96fb2e62209e` aprobó en una sola ejecución: **436 unitarias, tipos/builds, 154/154 E2E, producción aislada y migraciones**. Staging `hotfix-642ffae84efd` está saludable, conserva todas sus filas y aprobó 29 controles comerciales. Se verificó además un nuevo respaldo cifrado externo del runtime real anterior, restaurado y copiado cifrado al VPS. Producción fue actualizada a V4.10 tras la aprobación explícita del propietario. Todas sus filas quedaron conservadas y se verificó un respaldo posterior cifrado y restaurado. Ver [evidencia agregada](verificacion-v4-10.json).

## Alcance de publicación

Solo código: no hay migraciones nuevas ni cambios de configuración, credenciales, DNS, Caddy o servicios ajenos. Deben conservarse todas las filas existentes y el acceso. Preparar staging, respaldo y recuperación con el SHA probado antes de solicitar la autorización operativa de producción indicada por el propietario. La autorización de la publicación anterior no se reutiliza.

La auditoría cubre los recorridos identificados y la batería ejecutada; no equivale a una garantía de ausencia de errores. La impresión física en HP y el comportamiento de la tablet Android real siguen necesitando comprobación en esos dispositivos, como en V4.9.

La comparación inicial de recursos QA detectó la finalización de dos recolectores propios programados; se conservó ese resultado y una revisión separada verificó los demás recursos con la política existente. El primer preflight de actualización de staging se detuvo por una conexión temporal adicional a su red, antes de escrituras; la red se inspeccionó de nuevo antes del intento aprobado. No se eliminaron entornos QA históricos ni se modificaron otros proyectos.

## Publicación completada

El propietario aprobó el SHA probado y avisó de una recepción nueva. Se preservaron todos los datos, acceso y tablet. El primer intento perdió la conexión SSH después de restaurar el respaldo de la pausa y antes de activar. La recuperación revisó la identidad de los servicios detenidos, la ausencia del cron propio, el script anterior, la aprobación, el respaldo y todas las filas. Conservó los intentos de revisión y luego continuó desde ese punto, sin repetir un upgrade ni un vaciado. Producción terminó saludable, con el recolector propio reanudado, sin cambios de DNS/Caddy ni otras aplicaciones.

Acceso real: 21 controles aprobados; cuatro opciones de pago disponibles al consultar, vista previa de stock de solo lectura. Respaldo posterior cifrado en PC/VPS y restaurado desde la copia externa: 2026-11-10T02:07:12.485619+00:00. El documento del SENIAT y las nuevas correcciones de calibre recibidas durante la publicación son una ampliación posterior; no forman parte del runtime 642.
