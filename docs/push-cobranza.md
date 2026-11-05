# Avisos de cobranza para una tablet

El centro de cobranza dentro de la aplicación es la fuente de estado actual. Los avisos push son complementarios y requieren una tablet elegida, permiso del navegador y configuración del servidor. El propietario confirmó una tablet Android corporativa con WhatsApp. Esta entrega no acredita recepción real: falta el opt-in del dispositivo del propietario y la prueba en ese dispositivo. Tener WhatsApp no autoriza envíos automáticos ni mensajes de prueba a clientes.

La release `phase3-ef3d64616313`, commit `ef3d64616313b3a5f2184f37365dc751da07af29`, está desplegada y saludable en staging. VAPID está configurado y validado, con **cero dispositivos activos y cero envíos** al corte de la [verificación publicada](verificacion-staging-fase3.json). No se creó ninguna suscripción durante el despliegue ni durante el smoke comercial. La configuración del servidor no sustituye el permiso de la tablet.

## Acceso y configuración

Los endpoints `GET /api/push/status`, `POST /api/push/subscribe` y `POST /api/push/unsubscribe` requieren la sesión privada y el origen autorizado. Las mutaciones requieren `Idempotency-Key`. La demo pública no registra dispositivos.

El navegador pide permiso solo al tocar el botón de activación. Un único registro activo representa la tablet de cobranza. Reemplazar una tablet diferente requiere `replaceExisting: true` explícito, después del aviso de conflicto. La auditoría registra el cambio y su actor, sin endpoint ni claves. Desactivar comprueba el endpoint del dispositivo actual y borra sus claves; no desactiva accidentalmente otra tablet.

La API devuelve únicamente estado, etiqueta, clave VAPID pública y SHA-256 del endpoint para que el navegador reconozca su propia suscripción. El endpoint y las claves de suscripción son privados: [Push API de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) explica que ese endpoint es una URL con capacidad de envío. Se excluyen de logs, documentación, caché pública y auditoría visible.

El servidor necesita `MM_VAPID_PUBLIC_KEY`, `MM_VAPID_PRIVATE_KEY` y `MM_VAPID_SUBJECT`. Se comprueba que las claves P-256 correspondan. La clave privada debe cargarse desde un secreto externo por el iniciador de despliegue, nunca mediante un argumento CLI ni una variable `NEXT_PUBLIC_*`. Sin configuración completa, el estado es `configured: false`, no se inicia el temporizador y no se solicitan permisos al usuario. El paquete fijado es [web-push 3.6.7](https://github.com/web-push-libs/web-push), con tipos 3.6.4; su transporte cifra el contenido y usa VAPID.

En staging, `compose.push.staging.yaml` monta los tres archivos VAPID externos mediante `MM_VAPID_PUBLIC_KEY_FILE`, `MM_VAPID_PRIVATE_KEY_FILE` y `MM_VAPID_SUBJECT_FILE`, únicamente en API. Los archivos privados tienen UID/GID 1000:1000 y modo 0400, dentro de una carpeta 0700; el iniciador valida formato y correspondencia de la pareja antes de arrancar. No se incluyen claves en Git, imágenes, argumentos ni esta documentación.

La API conserva sus redes internas y dispone de la red de salida exclusiva `manzanas-maracay-staging_push_egress`. API y PostgreSQL no publican puertos. La activación no modificó Caddy, DNS ni redes compartidas. El dispatcher está configurado, pero sin una tablet registrada no realiza llamadas al proveedor; no se ha probado todavía el transporte y la entrega reales. [staging.md](staging.md) registra la release y sus comprobaciones operativas.

## Despacho y privacidad

- Cada 60 segundos, únicamente con VAPID configurado, se consulta un máximo de 100 comprobantes con saldo actual positivo y recordatorio interno efectivo no posterior a la fecha en `America/Caracas`.
- El vencimiento acordado no se convierte en recordatorio si el operador no indicó fecha interna. La fecha más reciente del historial puede borrar o reprogramar el recordatorio.
- La clave única `(sale_id, reminder_date)` impide repetir el mismo aviso para un comprobante y fecha de recordatorio, incluso con varios procesos. Los candidatos se agrupan en una sola notificación.
- Antes del intento se vuelven a consultar saldo, fecha y generación de la tablet. Los candidatos pagados, anulados, reprogramados o de una suscripción reemplazada se cancelan. No se mantiene una transacción PostgreSQL abierta durante la llamada de red.
- La pantalla bloqueada solo muestra «Manzanas Maracay» y un aviso genérico para revisar la aplicación. No contiene cliente, teléfono, número de comprobante, importe ni PDF. Al abrir `/cobranza` se exige sesión y se lee el estado actual.
- El transporte usa TLS normal, timeout de 8 segundos y TTL de 5 minutos. Los endpoints se limitan a FCM, Mozilla Push y Apple Push con rutas admitidas; se rechazan hosts arbitrarios, IP locales, credenciales, puertos alternativos y redirecciones de consulta. Otros proveedores de navegador necesitan revisión antes de admitirse.
- `accepted` significa aceptación por el proveedor push, no entrega confirmada en la tablet. Un timeout ambiguo o una interrupción después de reclamar no se reintenta automáticamente, para evitar avisos duplicados; el centro in-app conserva el recordatorio pendiente. Un 404/410 invalida solamente la generación de suscripción utilizada.

Un pago puede ocurrir después de la última comprobación y mientras el proveedor entrega el aviso. La notificación genérica y su TTL corto evitan mostrar una deuda obsoleta; al abrir la aplicación siempre se consulta el saldo actual. No se promete entrega exactamente una vez de extremo a extremo.

## Pruebas y pendientes

`tests/unit/push.test.ts` prueba allowlist/SSRF, claves, configuración ausente, reemplazo explícito en contrato, fecha Caracas y flujo de despacho con transporte simulado. Junto con los tests BCV se ejecutaron 40 casos focalizados (18 BCV y 22 push), todos aprobados. Las tres pruebas de lifecycle confirman que la configuración ausente no inicia consultas periódicas y que una configuración válida sin dispositivos no llama al proveedor. Nueve pruebas del iniciador verifican archivos VAPID completos, pareja inválida, rutas y tamaños rechazados, y aislamiento de web/migrador mediante simulaciones.

La batería local integrada aprobó 90 unitarias y 53 E2E. El smoke del staging publicado comprobó acceso autenticado, ocho rechazos anónimos, estado sin suscripción y operaciones comerciales DEMO. Estas comprobaciones no enviaron notificaciones ni acreditan recepción física. Véanse los resultados y sus límites en [entrega-fase-3.md](entrega-fase-3.md).

Queda probar permiso, entrega, bloqueo/desbloqueo, expiración, revocación y apertura de la app en la tablet Android corporativa real; también confirmar el perfil corporativo de WhatsApp al abrir la acción manual. Como referencia para otro dispositivo futuro, en iPhone/iPad WebKit documenta soporte de web push para aplicaciones añadidas a la pantalla de inicio desde iOS/iPadOS 16.4; no equivale a abrir una pestaña ordinaria. Ver [documentación oficial de WebKit](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/). No se afirmó haber realizado esa prueba.
