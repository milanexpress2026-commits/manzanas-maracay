# V4.16 — navegación en tablet y celulares

Estado: en preparación; **producción continúa en V4.15 / `501bd3bb06583535f9b3a79d00579721bb35fa1f`**. No publicar ni modificar el proxy sin la autorización operativa del propietario sobre la versión y el cambio final.

## Problema observado

El video privado del propietario muestra Ventas → Inicio → Ventas: la estructura aparece, pero los registros siguen ausentes entre los segundos 6 y 18. El propietario confirmó que la lentitud también ocurre en celulares. La mejora anterior del peso del PDF no demuestra que este recorrido funcione bien en esos dispositivos.

Una inspección de solo lectura del runtime real midió `/api/sales?search=&limit=100&offset=0` en 569 ms, con 59.364 bytes; catálogo en 266 ms y 30.619 bytes; inventario en 413 ms y 37.024 bytes. Son muestras puntuales desde la computadora del operador, no mediciones de la red del local. Se observaron solicitudes anticipadas a detalles de ventas y otros menús. El host propio no tiene un manejador `encode` en Caddy.

## Cambio de aplicación

- Primer bloque de ventas: 25 registros. «Cargar más ventas» conserva el acceso al historial y la búsqueda consulta todas las ventas del servidor.
- La primera página se consulta dentro del servidor, después de autenticar la sesión, y llega en el HTML/RSC. No espera la hidratación ni repite la lectura en el navegador. Fallos temporales conservan la recuperación visible; todas las consultas siguen siendo privadas y sin caché.
- Listado y tabla separados del formulario de nueva venta; se reutiliza el formateador de fechas de Venezuela.
- Sin precargas automáticas de comprobantes, filas de clientes/lotes ni enlaces del resumen. Cada enlace sigue funcionando normalmente al pulsarlo.
- Indicador durante el cambio de menú y texto visible mientras llegan los registros.
- Lecturas con cancelación al navegar y un límite de 20 segundos; una conexión detenida ofrece reintento. Una respuesta JSON incompleta ya no se interpreta como datos válidos vacíos.

No cambia la lógica comercial, los precios, las tasas, el inventario ni los documentos. No hay migraciones: las 18 existentes deben permanecer idénticas. No se añade caché persistente de información privada.

## Compresión de transporte propuesta

Preparar `encode zstd gzip` exclusivamente dentro del host `manzanas.ganamosclub.net`, conservando su upstream, autenticación, cabeceras y todos los demás hosts. Caddy negocia el algoritmo compatible con cada navegador. Validar la configuración completa y comparar las rutas ajenas antes de cualquier recarga autorizada.

La compresión dentro de un Route Handler de Next.js se descartó tras un ensayo local que detectó respuestas ilegibles: la versión instalada 16.4.5 elimina `Content-Encoding` en `server/send-response.js`. Ese código experimental se retiró y no llegó a staging ni producción. La compresión se verificará en Caddy aislado, manteniendo `Cache-Control: no-store`.

## Evidencia y límites

El ensayo usa una compilación de producción, 125 ventas sintéticas, 250 ms de latencia y 125.000 bytes/s de descarga, a CPU normal y reducida 6×/12×. La referencia previa llegó a 12.261 ms en la primera carga más exigente. Se comparan el mismo recorrido y los mismos datos; las cifras no equivalen a un ensayo físico de la tablet. Conservar los intentos fallidos y su causa en la evidencia privada.

El candidato con entrega inicial desde el servidor mostró registros en 497/989/1.685 ms (CPU 1×/6×/12×). En el regreso a Ventas se midieron 387/1.476/687 ms y una solicitud de ruta, sin otra consulta de listado. El instrumento del candidato registra la primera tabla visible desde el inicio de navegación y espera después a que terminen las cargas para medir recursos; el baseline anterior comenzaba esperando el evento `load`, por lo que no se debe presentar una razón exacta de aceleración. La variante intermedia que solo reducía filas no resolvió el peor perfil (12.587 ms); se descartó como cierre suficiente. Las capturas de 800 y 390 px son sintéticas.

Pendiente de cierre: pruebas completas, staging, compresión aislada y aprobación operativa. No afirmar que el video quedó resuelto ni que la velocidad física fue validada antes de comprobarlo con el propietario.

## Fuentes y decisión técnica

Se conserva Next.js, React y PostgreSQL: el trabajo observado se puede reducir en la instalación existente, sin migrar el sistema ni contratar otro proveedor.

- [Next.js: navegación, precarga y estados pendientes](https://nextjs.org/docs/app/getting-started/linking-and-navigating).
- [Next.js: carga de datos y esperas encadenadas](https://nextjs.org/docs/app/getting-started/fetching-data).
- [web.dev: reducir el tamaño transferido de contenido de texto](https://web.dev/articles/optimizing-content-efficiency-optimize-encoding-and-transfer).
- [Caddy: negociación Zstandard/Gzip y compresión de respuestas](https://caddyserver.com/docs/caddyfile/directives/encode).
- [Chrome DevTools: distinguir espera de red, respuesta y descarga](https://developer.chrome.com/docs/devtools/network/reference).
