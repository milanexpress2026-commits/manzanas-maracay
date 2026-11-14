# V4.16 — navegación en tablet y celulares

Estado: **publicada y verificada**. Autorización específica `call_59d28b34a0da48968140082bb5de523c` recibida y aplicada para código y compresión.

Runtime publicado: `c1f251a85bdded5491148f3a4de2bb558fefd47a`. Paquetes locales de staging y producción idénticos: SHA-256 `8bb28d744fde8c363948491bd691ea3406a8cfab35a26ac79ee25edacdabec0f`; excluyen únicamente capturas de documentación. Los commits posteriores de evidencia no sustituyen ese runtime.

## Problema observado

El video privado del propietario muestra Ventas → Inicio → Ventas: la estructura aparece, pero los registros siguen ausentes entre los segundos 6 y 18. El propietario confirmó que la lentitud también ocurre en celulares. La mejora anterior del peso del PDF no demuestra que este recorrido funcione bien en esos dispositivos.

Una inspección de solo lectura del runtime real midió `/api/sales?search=&limit=100&offset=0` en 569 ms, con 59.364 bytes; catálogo en 266 ms y 30.619 bytes; inventario en 413 ms y 37.024 bytes. Son muestras puntuales desde la computadora del operador, no mediciones de la red del local. Se observaron solicitudes anticipadas a detalles de ventas y otros menús. El host propio no tiene un manejador `encode` en Caddy.

## Cambio de aplicación

- Primer bloque de ventas: 25 registros. «Cargar más ventas» conserva el acceso al historial y la búsqueda consulta todas las ventas del servidor.
- La primera página se consulta dentro del servidor, después de autenticar la sesión, y llega en el HTML/RSC. No espera la hidratación ni repite la lectura en el navegador. Fallos temporales conservan la recuperación visible; todas las consultas siguen siendo privadas y sin caché.
- Al volver con «Atrás» o restaurar una página del navegador se vuelve a consultar el listado. La revisión detectó y corrigió la reutilización de una respuesta RSC anterior: solo se conserva una marca de lectura del servidor, sin guardar registros en almacenamiento persistente. Durante esa actualización se indica «Actualizando ventas…».
- Listado y tabla separados del formulario de nueva venta; se reutiliza el formateador de fechas de Venezuela.
- Sin precargas automáticas de comprobantes, filas de clientes/lotes ni enlaces del resumen. Cada enlace sigue funcionando normalmente al pulsarlo.
- Indicador durante el cambio de menú y texto visible mientras llegan los registros.
- Lecturas con cancelación al navegar y un límite de 20 segundos; una conexión detenida ofrece reintento. Una respuesta JSON incompleta ya no se interpreta como datos válidos vacíos.

No cambia la lógica comercial, los precios, las tasas, el inventario ni los documentos. No hay migraciones: las 18 existentes deben permanecer idénticas. No se añade caché persistente de información privada.

## Compresión de transporte propuesta

Preparar `encode zstd gzip` exclusivamente dentro del host `manzanas.ganamosclub.net`, conservando su upstream, autenticación, cabeceras y todos los demás hosts. Caddy negocia el algoritmo compatible con cada navegador. Validar la configuración completa y comparar las rutas ajenas antes de cualquier recarga autorizada.

La compresión dentro de un Route Handler de Next.js se descartó tras un ensayo local que detectó respuestas ilegibles: la versión instalada 16.4.5 elimina `Content-Encoding` en `server/send-response.js`. Ese código experimental se retiró y no llegó a staging ni producción. Un Caddy aislado con el staging anterior verificó igualdad exacta al descomprimir, acceso anónimo denegado y `Cache-Control: no-store`: catálogo 24.376→3.875 bytes, inventario 19.774→2.676 y ventas 11.621→1.463. El contenedor temporal fue retirado.

El plan del proxy se validó también contra su configuración activa: solo cambia el manejador de compresión del host propio; upstream y resto de la configuración son idénticos. Como el archivo está montado individualmente, el operador preparado conserva su inode, guarda una copia privada, valida, recarga sin reiniciar el contenedor y comprueba la configuración activa y Gzip. Ante fallo puede restaurar únicamente su propio cambio si el hash todavía coincide. La única modificación del host propio fue autorizada y aplicada, con copia privada y recarga validada sin reiniciar Caddy.

## Evidencia y límites

El ensayo usa una compilación de producción, 125 ventas sintéticas, 250 ms de latencia y 125.000 bytes/s de descarga, a CPU normal y reducida 6×/12×. La referencia previa llegó a 12.261 ms en la primera carga más exigente. Se comparan el mismo recorrido y los mismos datos; las cifras no equivalen a un ensayo físico de la tablet. Conservar los intentos fallidos y su causa en la evidencia privada.

El candidato con entrega inicial desde el servidor mostró registros en 497/989/1.685 ms (CPU 1×/6×/12×). En el regreso a Ventas se midieron 387/1.476/687 ms y una solicitud de ruta, sin otra consulta de listado. El instrumento del candidato registra la primera tabla visible desde el inicio de navegación y espera después a que terminen las cargas para medir recursos; el baseline anterior comenzaba esperando el evento `load`, por lo que no se debe presentar una razón exacta de aceleración. La variante intermedia que solo reducía filas no resolvió el peor perfil (12.587 ms); se descartó como cierre suficiente. Las capturas de 800 y 390 px son sintéticas.

La medición final de `c1f251a` mostró la primera tabla en **466/989/718 ms** y el regreso en **390/490/1.012 ms** para CPU 1×/6×/12×. Cada regreso requirió una solicitud de ruta, sin repetir `/api/sales`; son muestras sintéticas individuales, no percentiles ni una garantía sobre la conexión del negocio. Se revisaron visualmente 390 y 800 px.

Verificaciones locales finales: tipos y compilación aprobados, **463 unitarias**, **8 recorridos dirigidos** de navegación/recuperación y **14 casos de producción aislada** aprobados; su base temporal se limpió. El recorrido completo anterior tuvo 173/174 aprobados: una prueba de recuperación abría una consulta y revocaba la misma sesión antes de que terminara; se sincronizó ese paso del ensayo y pasó en las dos ejecuciones dirigidas posteriores. No afirmar que los 175 casos actuales pasaron juntos. Se corrigió además la generación ocasional de una clave VAPID sintética de 31 bytes en una prueba; la configuración push real no cambió. Se conservaron trazas y capturas de los intentos.

Los seis controles del operador de aplicación y cuatro de autorización del proxy pasaron. Las 18 migraciones permanecen idénticas; revisión de 844 archivos sin hallazgos de patrones de credenciales. Staging final saludable y 21 controles de acceso/documentos aprobados. La compresión final conservó el contenido exacto (ventas: 1.468 bytes comprimidos) y verificó registros en el HTML autorizado. Respaldo cifrado previo en PC y mismo VPS, restaurado y comprobado a `2026-11-14T15:52:08.677912+00:00`. La autorización operativa sobre código y compresión fue recibida y ejecutada. No afirmar que la velocidad física fue validada antes de comprobarlo con el propietario.

## Fuentes y decisión técnica

Se conserva Next.js, React y PostgreSQL: el trabajo observado se puede reducir en la instalación existente, sin migrar el sistema ni contratar otro proveedor.

- [Next.js: navegación, precarga y estados pendientes](https://nextjs.org/docs/app/getting-started/linking-and-navigating).
- [Next.js: carga de datos y esperas encadenadas](https://nextjs.org/docs/app/getting-started/fetching-data).
- [web.dev: reducir el tamaño transferido de contenido de texto](https://web.dev/articles/optimizing-content-efficiency-optimize-encoding-and-transfer).
- [Caddy: negociación Zstandard/Gzip y compresión de respuestas](https://caddyserver.com/docs/caddyfile/directives/encode).
- [Chrome DevTools: distinguir espera de red, respuesta y descarga](https://developer.chrome.com/docs/devtools/network/reference).

## Cierre de staging y publicación

El arranque del candidato en staging sufrió un corte SSH. Se preservaron los estados local y remoto y se comprobó que API/web ya estaban saludables, todas las filas seguían idénticas y producción/pares no cambiaron; se continuó la verificación y se reanudó únicamente su recolector, sin reiniciar los servicios. Un primer intento local de guardar esta evidencia recibió un error de tipo antes de operar servicios; se conservó y se completó la copia en bytes. Los intentos iniciales de compresión aislada requirieron la capacidad de puerto del binario Caddy; sus contenedores fueron retirados. No atribuir a producción esas incidencias de preparación.

La publicación autorizada está completada en el [PR #17](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/17), con [evidencia estructurada](verificacion-v4-16.json). Se conservan las 18 migraciones, todas las filas, acceso y tablet; los procesos propios están reanudados. Caddy recibió solamente la línea de compresión validada del host de Manzanas, con copia privada y recarga sin reiniciar su contenedor. DNS y rutas ajenas no cambiaron.

## Verificación en producción

Los 21 controles HTTPS y las cinco pantallas verificadas aprobaron. Ventas llega sin otra petición de listado; recepción conserva una sola lectura de catálogo. Las lecturas completas hasta `networkidle` de estas pantallas demoraron 2,2–4,2 segundos desde la computadora del operador; ese indicador espera todas las cargas y no es la primera tabla visible del ensayo sintético. No equivale a una medición física de los celulares del negocio.

Compresión real, contenido exacto y no-store preservados: catálogo 30.619→4.550 bytes, inventario 37.024→5.144, ventas 14.662→2.461 (83–86 % menos). Notas Carta/A4 de una venta real: 126.755/126.790 bytes, respuesta completa en 1.631/491 ms en estas muestras. Se verificaron nombre, RIF, dirección, total BCV del día de venta, firmas y geometría; sin observaciones ni saldo actual. La venta quedó intacta. Esto no certifica el diálogo ni la impresora físicos.

Respaldo posterior cifrado en PC y mismo VPS, restaurado y verificado: `2026-11-14T17:32:20.558992+00:00`. Las incidencias de comprobación se conservan: ruta relativa de autorización rechazada antes de detener servicios; dos textos de prueba con acentos mal codificados, corregidos sin cambiar runtime; y un primer sondeo PDF que falló sin registrar etapa, seguido de lectura instrumentada y verificación de contenido aprobadas. No se estableció la causa del primer sondeo PDF.

Para cargar esta versión, cerrar completamente la app y volver a abrirla en tablet y celulares. No requiere reinstalación ni volver a cargar mercancía.
