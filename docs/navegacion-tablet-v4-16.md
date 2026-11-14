# V4.16 â€” navegaciÃ³n en tablet y celulares

Estado: en preparaciÃ³n; **producciÃ³n continÃºa en V4.15 / `501bd3bb06583535f9b3a79d00579721bb35fa1f`**. No publicar ni modificar el proxy sin la autorizaciÃ³n operativa del propietario sobre la versiÃ³n y el cambio final.

Runtime candidato: `c1f251a85bdded5491148f3a4de2bb558fefd47a`. Paquetes locales de staging y producciÃ³n idÃ©nticos: SHA-256 `8bb28d744fde8c363948491bd691ea3406a8cfab35a26ac79ee25edacdabec0f`; excluyen Ãºnicamente capturas de documentaciÃ³n. Los commits posteriores de evidencia no sustituyen ese runtime.

## Problema observado

El video privado del propietario muestra Ventas â†’ Inicio â†’ Ventas: la estructura aparece, pero los registros siguen ausentes entre los segundos 6 y 18. El propietario confirmÃ³ que la lentitud tambiÃ©n ocurre en celulares. La mejora anterior del peso del PDF no demuestra que este recorrido funcione bien en esos dispositivos.

Una inspecciÃ³n de solo lectura del runtime real midiÃ³ `/api/sales?search=&limit=100&offset=0` en 569 ms, con 59.364 bytes; catÃ¡logo en 266 ms y 30.619 bytes; inventario en 413 ms y 37.024 bytes. Son muestras puntuales desde la computadora del operador, no mediciones de la red del local. Se observaron solicitudes anticipadas a detalles de ventas y otros menÃºs. El host propio no tiene un manejador `encode` en Caddy.

## Cambio de aplicaciÃ³n

- Primer bloque de ventas: 25 registros. Â«Cargar mÃ¡s ventasÂ» conserva el acceso al historial y la bÃºsqueda consulta todas las ventas del servidor.
- La primera pÃ¡gina se consulta dentro del servidor, despuÃ©s de autenticar la sesiÃ³n, y llega en el HTML/RSC. No espera la hidrataciÃ³n ni repite la lectura en el navegador. Fallos temporales conservan la recuperaciÃ³n visible; todas las consultas siguen siendo privadas y sin cachÃ©.
- Al volver con Â«AtrÃ¡sÂ» o restaurar una pÃ¡gina del navegador se vuelve a consultar el listado. La revisiÃ³n detectÃ³ y corrigiÃ³ la reutilizaciÃ³n de una respuesta RSC anterior: solo se conserva una marca de lectura del servidor, sin guardar registros en almacenamiento persistente. Durante esa actualizaciÃ³n se indica Â«Actualizando ventasâ€¦Â».
- Listado y tabla separados del formulario de nueva venta; se reutiliza el formateador de fechas de Venezuela.
- Sin precargas automÃ¡ticas de comprobantes, filas de clientes/lotes ni enlaces del resumen. Cada enlace sigue funcionando normalmente al pulsarlo.
- Indicador durante el cambio de menÃº y texto visible mientras llegan los registros.
- Lecturas con cancelaciÃ³n al navegar y un lÃ­mite de 20 segundos; una conexiÃ³n detenida ofrece reintento. Una respuesta JSON incompleta ya no se interpreta como datos vÃ¡lidos vacÃ­os.

No cambia la lÃ³gica comercial, los precios, las tasas, el inventario ni los documentos. No hay migraciones: las 18 existentes deben permanecer idÃ©nticas. No se aÃ±ade cachÃ© persistente de informaciÃ³n privada.

## CompresiÃ³n de transporte propuesta

Preparar `encode zstd gzip` exclusivamente dentro del host `manzanas.ganamosclub.net`, conservando su upstream, autenticaciÃ³n, cabeceras y todos los demÃ¡s hosts. Caddy negocia el algoritmo compatible con cada navegador. Validar la configuraciÃ³n completa y comparar las rutas ajenas antes de cualquier recarga autorizada.

La compresiÃ³n dentro de un Route Handler de Next.js se descartÃ³ tras un ensayo local que detectÃ³ respuestas ilegibles: la versiÃ³n instalada 16.4.5 elimina `Content-Encoding` en `server/send-response.js`. Ese cÃ³digo experimental se retirÃ³ y no llegÃ³ a staging ni producciÃ³n. Un Caddy aislado con el staging anterior verificÃ³ igualdad exacta al descomprimir, acceso anÃ³nimo denegado y `Cache-Control: no-store`: catÃ¡logo 24.376â†’3.875 bytes, inventario 19.774â†’2.676 y ventas 11.621â†’1.463. El contenedor temporal fue retirado.

El plan del proxy se validÃ³ tambiÃ©n contra su configuraciÃ³n activa: solo cambia el manejador de compresiÃ³n del host propio; upstream y resto de la configuraciÃ³n son idÃ©nticos. Como el archivo estÃ¡ montado individualmente, el operador preparado conserva su inode, guarda una copia privada, valida, recarga sin reiniciar el contenedor y comprueba la configuraciÃ³n activa y Gzip. Ante fallo puede restaurar Ãºnicamente su propio cambio si el hash todavÃ­a coincide. No se ha escrito ni recargado el proxy real.

## Evidencia y lÃ­mites

El ensayo usa una compilaciÃ³n de producciÃ³n, 125 ventas sintÃ©ticas, 250 ms de latencia y 125.000 bytes/s de descarga, a CPU normal y reducida 6Ã—/12Ã—. La referencia previa llegÃ³ a 12.261 ms en la primera carga mÃ¡s exigente. Se comparan el mismo recorrido y los mismos datos; las cifras no equivalen a un ensayo fÃ­sico de la tablet. Conservar los intentos fallidos y su causa en la evidencia privada.

El candidato con entrega inicial desde el servidor mostrÃ³ registros en 497/989/1.685 ms (CPU 1Ã—/6Ã—/12Ã—). En el regreso a Ventas se midieron 387/1.476/687 ms y una solicitud de ruta, sin otra consulta de listado. El instrumento del candidato registra la primera tabla visible desde el inicio de navegaciÃ³n y espera despuÃ©s a que terminen las cargas para medir recursos; el baseline anterior comenzaba esperando el evento `load`, por lo que no se debe presentar una razÃ³n exacta de aceleraciÃ³n. La variante intermedia que solo reducÃ­a filas no resolviÃ³ el peor perfil (12.587 ms); se descartÃ³ como cierre suficiente. Las capturas de 800 y 390 px son sintÃ©ticas.

La mediciÃ³n final de `c1f251a` mostrÃ³ la primera tabla en **466/989/718 ms** y el regreso en **390/490/1.012 ms** para CPU 1Ã—/6Ã—/12Ã—. Cada regreso requiriÃ³ una solicitud de ruta, sin repetir `/api/sales`; son muestras sintÃ©ticas individuales, no percentiles ni una garantÃ­a sobre la conexiÃ³n del negocio. Se revisaron visualmente 390 y 800 px.

Verificaciones locales finales: tipos y compilaciÃ³n aprobados, **463 unitarias**, **8 recorridos dirigidos** de navegaciÃ³n/recuperaciÃ³n y **14 casos de producciÃ³n aislada** aprobados; su base temporal se limpiÃ³. El recorrido completo anterior tuvo 173/174 aprobados: una prueba de recuperaciÃ³n abrÃ­a una consulta y revocaba la misma sesiÃ³n antes de que terminara; se sincronizÃ³ ese paso del ensayo y pasÃ³ en las dos ejecuciones dirigidas posteriores. No afirmar que los 175 casos actuales pasaron juntos. Se corrigiÃ³ ademÃ¡s la generaciÃ³n ocasional de una clave VAPID sintÃ©tica de 31 bytes en una prueba; la configuraciÃ³n push real no cambiÃ³. Se conservaron trazas y capturas de los intentos.

Los seis controles del operador de aplicaciÃ³n y cuatro de autorizaciÃ³n del proxy pasaron. Las 18 migraciones permanecen idÃ©nticas; revisiÃ³n de 844 archivos sin hallazgos de patrones de credenciales. Pendiente de cierre: staging, respaldo previo restaurado y aprobaciÃ³n operativa sobre cÃ³digo y recarga de compresiÃ³n. No afirmar que la velocidad fÃ­sica fue validada antes de comprobarlo con el propietario.

## Fuentes y decisiÃ³n tÃ©cnica

Se conserva Next.js, React y PostgreSQL: el trabajo observado se puede reducir en la instalaciÃ³n existente, sin migrar el sistema ni contratar otro proveedor.

- [Next.js: navegaciÃ³n, precarga y estados pendientes](https://nextjs.org/docs/app/getting-started/linking-and-navigating).
- [Next.js: carga de datos y esperas encadenadas](https://nextjs.org/docs/app/getting-started/fetching-data).
- [web.dev: reducir el tamaÃ±o transferido de contenido de texto](https://web.dev/articles/optimizing-content-efficiency-optimize-encoding-and-transfer).
- [Caddy: negociaciÃ³n Zstandard/Gzip y compresiÃ³n de respuestas](https://caddyserver.com/docs/caddyfile/directives/encode).
- [Chrome DevTools: distinguir espera de red, respuesta y descarga](https://developer.chrome.com/docs/devtools/network/reference).

## Cierre de staging y publicación pendiente

El arranque del candidato en staging sufrió un corte SSH. Se preservaron los estados local y remoto y se comprobó que API/web ya estaban saludables, todas las filas seguían idénticas y producción/pares no cambiaron; se continuó la verificación y se reanudó únicamente su recolector, sin reiniciar los servicios. Un primer intento local de guardar esta evidencia recibió un error de tipo antes de operar servicios; se conservó y se completó la copia en bytes. Los intentos iniciales de compresión aislada requirieron la capacidad de puerto del binario Caddy; sus contenedores fueron retirados. No atribuir a producción esas incidencias de preparación.

El cambio está listo para autorización en el [PR #17](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/17), con [evidencia estructurada](verificacion-v4-16.json). La operación propuesta sube/compila el paquete exacto, pausa solo la aplicación/tasas/recordatorios propios, crea y restaura un respaldo cifrado nuevo PC/VPS, conserva las 18 migraciones y todas las filas, activa el candidato y recarga Caddy con la única línea de compresión validada. Incluye copia privada de la configuración y verificación de acceso/documentos/respaldo posterior. DNS y rutas ajenas permanecen fuera del cambio. Producción todavía sigue en V4.15.
