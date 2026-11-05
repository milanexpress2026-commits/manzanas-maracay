# Catálogo asistido y cobros V4

V4 verificada en staging con código `53aeff14b981c52417d97c257f5be3ba1dd9d45f`, release `hotfix-53aeff14b981`, el 5 de noviembre de 2026. **Producción sigue en `phase4-2a81817fe2c1`.** El propietario entregó después la continuación V4.2 corregida: se incorporará antes de solicitar la promoción definitiva. Este informe conserva la evidencia de V4; sus reglas de empaque no sustituyen la aclaración posterior del calibre 100.

Se conserva el [PR #4](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/4), abierto y listo para revisión en `3378f7b46f7da27f75e9ff43faa6b2247072840d`, reconfirmado el 5 de noviembre de 2026. V4 parte de ese commit en `feature/catalogo-tasas-v4`, sin reescribir migraciones ni hacer merge. Staging previo: `hotfix-8612e8230bb5`, 14 migraciones; producción previa: `phase4-2a81817fe2c1`, 13 migraciones.

## Qué se añade

«Preparar catálogo de Manzanas Maracay» permite revisar, editar y excluir nombres y borradores antes de confirmar. También está disponible si ya se ingresaron algunos productos: reutiliza coincidencias exactas de nombre dentro de la fruta, conserva los empaques existentes y no fusiona alias. Una segunda confirmación no duplica maestros. No crea existencias, precios, costos, proveedores, clientes ni operaciones.

| Familia/línea | Opciones preparadas | Empaque por revisar |
| --- | --- | --- |
| Manzana tradicional | Gala, Roja normal, Verde, Pink Lady, Amarilla; calibres 88, 100, 113, 125, 135, 150, 163, 175, 198 | Caja/media/blíster; cantidad y preparación de medias confirmadas por el operador |
| Manzana granel | Línea comercial, calibres 150, 163, 175, 198, 216, 232 | Caja/media comercial; sin blíster ni piezas |
| Pera | Forelle, Packcam; 90, 100, 110, 120, 135 | Cantidad de blíster y preparación de medias pendientes |
| Kiwi | Sin variedad ni calibre obligatorio | Caja 10 kg y media 5 kg; confirmar empaque |
| Uva | Roja y Morada | Solo caja, sin peso ni medias |
| Mandarina | Maestro de fruta | Sin presentaciones inventadas |

Las plantillas activan solo los calibres concretos seleccionados. Se pueden añadir excepcionales y reutilizar la selección. Las sugerencias de los audios nunca confirman un lote automáticamente; 90 y los ejemplos contradictorios permanecen sin inferencia. Lady y Pink Lady se conservan separados.

Agregar producto mantiene un recorrido de tres pasos con altas de opciones en la misma pantalla. La recepción abre con el producto elegido y permite revisar el empaque pendiente. Confirmar el empaque y recibir mercancía forman una operación atómica: la configuración servirá también para futuras recepciones, y cada lote conserva su snapshot anterior.

Los cuatro métodos visibles en venta y abono son Efectivo USD, Bolívares a tasa BCV, USDT y Bolívares a tasa USDT compra. El acuerdo inicial decide qué opción VES es compatible. USD/USDT cancelan deuda 1:1. Elegir un método no cambia la lista ni el monto pactado. Contado completa el total y no muestra calendario; crédito sin abono no crea pago cero ni exige método.

## Qué se conserva del V3

Se reutilizan el ledger, FIFO, disponibilidad vendible, acuerdos `divisa`/`bcv`, clasificación histórica `legacy_bcv`, revisión de cobro con cotización congelada, idempotencia y reversas. Las consultas oficiales de BCV y la referencia comercial BUY USDT/VES de Binance siguen en un recolector separado, con verificación TLS y cache inmutable. No se crea una tasa manual o ficticia para producción.

V4 no agrega otra migración: producción requiere únicamente la `0013_agreed_settlement_rates` ya probada en V3, pasando de 13 a 14. Staging conserva sus 14. La confirmación de recepción respeta los triggers existentes.

## Preparación de producción

El candidato se empaqueta desde un commit exacto y se construyen las imágenes propias sin reemplazar los servicios activos. La actualización conserva la base, volumen, credenciales, sesiones y datos existentes; no ejecuta seed ni reinicia PostgreSQL. El catálogo recientemente cargado por los dueños se vuelve a inspeccionar antes de promover, sin repetir el reinicio anterior.

La aprobación final debe identificar el commit, la migración 0013 y el recolector de producción. En la ventana aprobada se detienen únicamente API/web del negocio, se crea otra copia cifrada en la computadora y se prueba su recuperación aislada, se comprueba conservación de datos, se migra y se vincula la activación al nuevo commit. El alias `mm-production-web` y la ruta actual permanecen; no hace falta cambiar DNS ni Caddy.

El recolector usa su propio rol limitado `mm_prod_rates`, secreto, red de salida y cron de cinco minutos. La API solo lee tasas. La imagen de herramientas incluye únicamente el certificado intermedio público verificado. Los respaldos posteriores conservan también las ACL del recolector; su ensayo aislado utiliza un rol sin login ni contraseña real.

Si falla la migración o verificación, se mantienen detenidos los escritores propios para inspección. **No se arranca el código anterior de 13 migraciones sobre el esquema de 14.** Se prepara una corrección compatible; restaurar la copia anterior requiere verificar que no existan nuevas operaciones y aprobación específica para esa restauración. No hay downgrade ni pérdida de datos automática.

## Evidencia ejecutada

- Tipos, 201 pruebas unitarias y compilaciones API/web: aprobados.
- QA de producción aislada: 13/13, incluida preparación desde cero, recepción, venta al contado, crédito y abonos. Sin precios ficticios; limpieza comprobada.
- Migraciones: base nueva de 14 y actualización 13→14 con conservación de datos, hashes y acuerdos históricos.
- Navegador completo: 83/84. El único fallo suponía que el calibre excepcional 90 no existía después de una ejecución anterior. Se corrigió la prueba para comprobar el delta y conservar los registros previos; ejecución dirigida posterior 2/2. No se presenta como una corrida completa 84/84.
- Staging: respaldo restaurado antes y después, 14 migraciones conservadas, datos y acuerdos anteriores intactos; recolector propio reactivado y otras aplicaciones preservadas. Acceso autenticado, lecturas, tasas BCV/USDT vigentes y cierre de sesión: 15 verificaciones aprobadas.
- Respaldo real cifrado fuera del VPS: recuperación aislada de esquema 13 y ensayo 13→14 aprobados; 36 tablas conservadas, permisos comprobados y recursos temporales eliminados. No se escribió en producción. La restauración posterior de un dump de 14 con ACL del recolector queda pendiente de la promoción real.

Los cambios posteriores a `53aeff14` de este hito son pruebas y evidencia, sin diferencias de código ejecutable. [Registro resumido](verificacion-v4.json). [Capturas y vídeo](capturas/catalogo-v4/).

Una tablet Android física no está conectada a este entorno: la emulación táctil no acredita descarga ni notificación real en ese dispositivo. Los PDF siguen siendo comprobantes comerciales; impresión HP y homologación fiscal no forman parte de V4.
