# Entrega de la fase 2 — Manzanas Maracay

**4 de noviembre de 2026. Implementación y pruebas aprobadas. Staging HTTPS activo con acceso invitado: [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net). Release final `phase2-7ae1d75`.**

## Qué se puede probar

La fase 2 conserva el catálogo y añade acceso por usuarios invitados, proveedores, recepción de mercancía por lotes e inventario operativo. Las pantallas utilizan la API NestJS y PostgreSQL; las operaciones no se confirman únicamente en el navegador.

| Pantalla             | Funciones disponibles                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Acceso               | Inicio y cierre de sesión; sesión revocable y caducidad por tiempo/inactividad                                                    |
| Catálogo             | Frutas, variedades, calibres y configuración de empaques; edición con versión                                                     |
| Proveedores          | Alta, consulta, edición y desactivación sin borrar historial                                                                      |
| Recepciones          | Varias líneas de cajas cerradas; proveedor, referencia, fecha, costo USD, notas y blíster por caja de cada lote                   |
| Inventario           | Consulta por fruta, variedad, calibre, lote y estado; resumen físico, contenedores e historial                                    |
| Operaciones del lote | Abrir caja/blíster, retirar blíster, preparar media caja con conteo, ajustar con motivo y revertir el último movimiento admisible |

Se distingue el inventario físico de sus equivalencias: tres cajas de cinco blíster, después de retirar uno, dejan dos cajas cerradas y cuatro blíster intactos en una caja abierta. Son catorce blíster equivalentes. El calibre no determina piezas; un empaque intacto mantiene el conteo desconocido hasta contarlo. Preparar dieciocho de treinta y siete deja diecinueve.

Cada recepción conserva empaque, versión y costo históricos por lote. Un cambio del catálogo no reescribe esos datos. Historial, auditoría y recibos idempotentes acompañan los cambios de stock en la misma transacción. Las reversas añaden un movimiento compensatorio; no borran eventos.

## Verificación ejecutada

El punto de partida de fase 1 aprobó tipos, compilación, **11 pruebas unitarias y 13 escenarios E2E/API/SQL** antes de comenzar. Su evidencia histórica permanece en [entrega-fase-1.md](entrega-fase-1.md).

| Comprobación de fase 2                  | Resultado confirmado                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| TypeScript                              | Aprobado                                                                                                    |
| Vitest                                  | **23 de 23 pruebas aprobadas**                                                                              |
| Compilación API y web                   | Aprobada                                                                                                    |
| Playwright con API y PostgreSQL real    | **32 de 32 escenarios aprobados**, aproximadamente 1,7 minutos                                              |
| Accesibilidad automatizada              | Sin infracciones en los criterios WCAG 2 A/AA y 2.1 AA evaluados por axe-core en los escenarios incluidos   |
| Migraciones desde base de pruebas nueva | Las seis migraciones, `0000` a `0005`, aplicadas y verificadas                                              |
| Construcción Docker en VPS              | Aprobada para los artefactos del proyecto                                                                   |
| Integración de Caddy                    | Corrección de alias desplegada; rutas del proxy preservadas, cinco rondas GET y smoke HTTPS final aprobados |

La suite final usó exclusivamente `manzanas_maracay_test`. Durante la integración se detectó que una ejecución había migrado `0005` mientras todavía se completaba su archivo. La prueba de inserción tardía expuso la falta del trigger en esa base descartable. Se recreó únicamente la base de pruebas y se repitió la suite con la migración final completa: los 32 escenarios pasaron. No se borró la base de desarrollo ni se alteraron bases ajenas para resolverlo.

Los 23 tests unitarios incluyen reglas conservadas de fases posteriores, como precisión monetaria y rechazo de tasas inválidas. Que esos tests pasen no habilita ventas, cobranza ni una conexión real con BCV.

## Aceptación del prompt de fase 2

Los números corresponden a los dieciséis casos del [brief autorizado](referencias/brief-fase-2.txt). Las pruebas locales y las comprobaciones externas están completas. El caso 16 registra una afectación HTTP temporal, su corrección y la verificación final; no se declara que todo el despliegue transcurrió sin impacto.

| N.º | Caso                                                   | Evidencia y resultado                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Recibir 3 cajas Gala 80 con 5 blíster                  | [Inventario: recepción y retiros](../tests/e2e/inventory.spec.ts#L84): exactamente 3 cajas cerradas. Aprobado.                                                                                                                                                                                                              |
| 2   | Retirar 1; quedar 2 cajas y 4 blíster, equivalencia 14 | [Mismo escenario](../tests/e2e/inventory.spec.ts#L84). Aprobado.                                                                                                                                                                                                                                                            |
| 3   | Retirar los 4 restantes y marcar la caja vacía         | [Mismo escenario](../tests/e2e/inventory.spec.ts#L84): excluye la caja vacía del disponible. Aprobado.                                                                                                                                                                                                                      |
| 4   | Priorizar blíster ya disponibles                       | [Mismo escenario](../tests/e2e/inventory.spec.ts#L84): comprueba las identidades retiradas antes de abrir otra caja. Aprobado.                                                                                                                                                                                              |
| 5   | Calibre 180 con 4 blíster, sin inferir 180 piezas      | [Snapshot y calibre](../tests/e2e/inventory.spec.ts#L126). Aprobado.                                                                                                                                                                                                                                                        |
| 6   | Editar catálogo sin cambiar lotes existentes           | [Snapshot y calibre](../tests/e2e/inventory.spec.ts#L126). Aprobado.                                                                                                                                                                                                                                                        |
| 7   | Sobrescribir empaque en lote nuevo sin afectar otros   | [Snapshot y calibre](../tests/e2e/inventory.spec.ts#L126). Aprobado.                                                                                                                                                                                                                                                        |
| 8   | Contar 37, preparar 18 y conservar 19                  | [Media caja desde caja](../tests/e2e/inventory.spec.ts#L154), [desde blíster](../tests/e2e/inventory.spec.ts#L190) y [flujo de interfaz](../tests/e2e/operations-ui.spec.ts#L65). Aprobado.                                                                                                                                 |
| 9   | Rechazar 37 frente a 18 + 20                           | [Media caja](../tests/e2e/inventory.spec.ts#L154): rechazo sin modificar stock; también en interfaz. Aprobado.                                                                                                                                                                                                              |
| 10  | Conservar cantidad desconocida como `null`             | [Recepción](../tests/e2e/inventory.spec.ts#L84) y [contrato unitario](../tests/unit/inventory.test.ts#L30). Aprobado.                                                                                                                                                                                                       |
| 11  | Dos solicitudes sobre el último blíster                | [Concurrencia](../tests/e2e/inventory.spec.ts#L230): una confirma, otra recibe conflicto. Aprobado.                                                                                                                                                                                                                         |
| 12  | Reintento con misma clave sin doble salida             | [Idempotencia](../tests/e2e/inventory.spec.ts#L230) y [respuesta perdida en recepción](../tests/e2e/operations-ui.spec.ts#L65). Aprobado.                                                                                                                                                                                   |
| 13  | Reversa y auditoría sin borrar historial               | [Reversa](../tests/e2e/inventory.spec.ts#L263), [proyección e inmutabilidad](../tests/e2e/inventory.spec.ts#L370) y [auditoría SQL](../tests/e2e/integrity.spec.ts#L117). Aprobado.                                                                                                                                         |
| 14  | Recarga, errores de conexión y teléfono                | [Proveedores persistentes](../tests/e2e/operations-ui.spec.ts#L35), [flujo completo](../tests/e2e/operations-ui.spec.ts#L65) y [navegación/recuperación móvil](../tests/e2e/operations-ui.spec.ts#L173). Aprobado.                                                                                                          |
| 15  | Denegar visitantes y escritura sin sesión              | [Pruebas locales](../tests/e2e/auth.spec.ts#L22) y smoke HTTPS repetido en 7ae1d75: API anónima 401, pantalla privada 307, cookie protegida, origen ajeno 403 y logout 401. Aprobado.                                                                                                                                       |
| 16  | Desplegar sin alterar ni detener servicios ajenos      | [Incidencia resuelta y verificación final](infrastructure.md#incidencia-de-alias-durante-la-integración-del-proxy): hubo un 502 temporal en Socios por alias, corregido. Cinco rondas GET y auditoría final de contenedores aprobadas; no se reiniciaron aplicaciones ajenas. Se conserva la salvedad del impacto temporal. |

## Pantallas y evidencia visual

Se conserva el logo oficial, sin redibujar ni deformar, y la identidad verde oscuro, rojo manzana y crema. La interfaz muestra `ENTORNO DE PRUEBAS` en los entornos correspondientes y distingue lotes DEMO. Las capturas representan la aplicación ejecutada con datos identificados de demostración, no los renders conceptuales originales.

| Vista                     | Escritorio                                               | Teléfono                                            |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Acceso                    | [Ver captura](capturas/fase2-login-escritorio.png)       | [Ver captura](capturas/fase2-login-movil.png)       |
| Proveedores               | [Ver captura](capturas/fase2-proveedores-escritorio.png) | [Ver captura](capturas/fase2-proveedores-movil.png) |
| Recepción                 | [Ver captura](capturas/fase2-recepcion-escritorio.png)   | [Ver captura](capturas/fase2-recepcion-movil.png)   |
| Inventario                | [Ver captura](capturas/fase2-inventario-escritorio.png)  | [Ver captura](capturas/fase2-inventario-movil.png)  |
| Preparación de media caja | [Ver captura](capturas/fase2-media-caja-escritorio.png)  | [Ver captura](capturas/fase2-media-caja-movil.png)  |

Se generaron e inspeccionaron las diez capturas de fase 2 y las tres del catálogo actualizado. Proceden del entorno local autenticado; el inventario DEMO muestra tres cajas recibidas y un blíster retirado, con dos cajas cerradas y cuatro blíster intactos restantes. La media caja se captura en la revisión de 37 = 18 + 19, sin pulsar Confirmar. El proceso es reproducible con `scripts/capture-phase2.mjs --production`; repetirlo conserva el lote DEMO existente. Las imágenes anteriores de fase 1 permanecen en el historial Git, no como PNG duplicados en esta rama. Dimensiones y límites: [visual-review.md](visual-review.md).

## GitHub

Rama: [`phase-2/inventario-staging`](https://github.com/milanexpress2026-commits/manzanas-maracay/tree/phase-2/inventario-staging), basada en el estado revisado `6c10243` de fase 1. Commits de implementación:

- [`57bd0a7`](https://github.com/milanexpress2026-commits/manzanas-maracay/commit/57bd0a7): acceso invitado e inventario transaccional.
- [`518c5c9`](https://github.com/milanexpress2026-commits/manzanas-maracay/commit/518c5c9): staging aislado, respaldo, restauración y guía operativa.
- [`7ae1d75`](https://github.com/milanexpress2026-commits/manzanas-maracay/commit/7ae1d75): nombre exclusivo del servicio web para evitar colisión DNS con el proxy compartido.

[Pull Request #1 en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/1), dirigido a `phase-1/foundations`. El commit `4abf159` incorpora trece capturas y el ejecutor reproducible de capturas. No se hizo merge ni push forzado. La aplicación se probó inicialmente sobre `518c5c9`; `7ae1d75` cambia solo el nombre del servicio Compose y se verificó con la nueva construcción, runtime, alias, rutas, GET de hosts y sesión HTTPS. No modifica las reglas de negocio; no se repitió la suite de negocio por ese único cambio de infraestructura.

## Estado de staging

URL activa: **[https://manzanas.ganamosclub.net](https://manzanas.ganamosclub.net)**, con cuenta invitada. La release final es `phase2-7ae1d75`, commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef`, desplegada en recursos exclusivos del VPS. PostgreSQL, API y `mm-staging-web` están saludables. PostgreSQL y API no publican puertos; Caddy ofrece la web por HTTPS. El cierre externo de la release corregida se confirmó a las 21:08:33 UTC.

Desde la URL externa se verificaron health 200, API anónima 401, pantalla privada con redirección 307, login y consulta autenticada 200, cookie `__Host-mm_session` con `Secure`, `HttpOnly` y `SameSite=Strict`, rechazo de origen ajeno 403 y revocación al salir. HTTP redirige a HTTPS con 308. El certificado Let's Encrypt observado es válido hasta el 2 de febrero de 2027. También se inició sesión con la cuenta del propietario en el navegador y se consultó el inventario DEMO. La muestra remota contiene tres cajas recibidas y un blíster retirado: dos cajas cerradas y cuatro blíster intactos, catorce equivalentes, con piezas desconocidas nulas. No se importaron datos comerciales reales.

El [registro de verificación de staging](verificacion-staging.json) conserva los resultados reales del smoke HTTPS y las cinco rondas GET, sin credenciales ni tokens.

El respaldo privado de las 20:47 UTC se restauró satisfactoriamente en un contenedor temporal sin red ni puertos, usando un volumen exclusivo. La comprobación validó tablas, migraciones, usuarios y conciliación de lotes, historial y saldos; los recursos temporales se retiraron al terminar. Falta una copia segura fuera del VPS antes de utilizar datos comerciales reales.

Tras la aprobación específica del propietario se creó el registro A `manzanas` en modo DNS only y se añadió su host a Caddy con validación y recarga sin reiniciarlo. Durante la integración se detectó un 502 temporal en Socios por colisión del alias `web` de la nueva red. Desconectar solo la red de Manzanas recuperó su respuesta. Se renombró el servicio a `mm-staging-web`, se desplegó `7ae1d75` y se reconectó con prioridad de gateway −1, preservando todas las rutas previas del proxy. Cinco rondas GET consecutivas confirmaron Manzanas health 200, Socios raíz 302 y Pedal raíz 200; el smoke completo de sesión se repitió satisfactoriamente. La auditoría final de diez contenedores conservó ID, imagen, inicio y salud de los nueve estables, con el worker preexistente sin intervención. [Detalle de la incidencia resuelta](infrastructure.md#incidencia-de-alias-durante-la-integración-del-proxy). No quedan permisos ni datos pendientes para utilizar la URL actual.

La [captura de staging](capturas/staging-escritorio.jpg), actualizada después de la corrección, documenta la sesión del propietario, la etiqueta de pruebas y el inventario DEMO en la aplicación publicada. No contiene credenciales.

La configuración usa directorio, base, redes, volumen y secretos propios; no publica PostgreSQL ni la API. Los procedimientos de actualización, respaldo y reversión están en [staging.md](staging.md), y los accesos en [authentication.md](authentication.md). No hay contraseñas ni tokens en esta entrega.

## Límites deliberados

- Recepción por cajas cerradas, hasta 50 líneas y 1.000 cajas por documento; un almacén inicial, sin transferencias ni multisucursal.
- Los ajustes de interfaz ofrecen contenedores con existencia. No restauran contenedores vacíos desde ese selector; una reversa admisible restaura el estado físico anterior.
- Solo puede revertirse una vez el último movimiento del lote; se rechazan movimientos con operaciones posteriores y reversas de reversas.
- El bloqueo global del árbol de inventario prioriza consistencia y limita concurrencia entre lotes. No hay afirmación de escala ilimitada ni pruebas de carga de producción.
- Acceso por invitación, sin registro público, recuperación por correo ni roles diferenciados.
- PWA con página sin conexión, sin cachear datos operativos ni registrar movimientos fuera de línea.
- Chromium en tamaños de escritorio/teléfono; pendientes dispositivos reales, Safari/iOS y lector de pantalla. Axe-core no certifica accesibilidad completa.
- Sin ventas, facturación, cobranza, WhatsApp ni BCV en vivo. Los retiros son movimientos internos. No se despliega producción ni se cargan datos comerciales reales para la demostración.

## Cómo continuar

Para probar en esta computadora: `npm run dev`, abrir `http://127.0.0.1:3100` y usar el acceso privado de `.local/auth-local.json`. No compartir ese archivo. Los comandos completos están en [README](../README.md). Al terminar la validación y las capturas se cerraron los servicios locales y los puertos 3100, 3101, 3200, 3201 y 55432; el iniciador permite volver a abrirlos conservando los datos.

La vista previa ya permite revisar recepción e inventario con el propietario. Las cuentas individuales de socios se preparan al recibir sus nombres de usuario, entregando las credenciales por un canal privado, nunca por chat. Antes de utilizar datos comerciales reales corresponde revisar el flujo y guardar una copia segura del respaldo fuera del VPS. Las fases comerciales posteriores requieren una nueva revisión de alcance. Para pasar el proyecto a otro chat, utilizar [continuar-en-chatgpt.md](continuar-en-chatgpt.md).
