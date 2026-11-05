# Revisión de aislamiento y acceso — fase 4

Revisión de implementación, pruebas dirigidas y procedimientos propios. No sustituye una auditoría exhaustiva ni acredita por sí sola el despliegue remoto. El estado ejecutado se registra en [entrega](entrega-fase-4-produccion.md).

## Controles revisados

- Producción se valida en servidor y se vincula a una instancia PostgreSQL exclusiva. No basta cambiar una etiqueta del navegador. El arranque rechaza conexión, roles o vínculo incompatibles; reiniciar una base legítima con datos no exige vaciarla.
- La migración aditiva `0011` preserva historia, impide cambiar las marcas DEMO y aplica políticas de fila forzadas. La migración `0012` añade la preferencia de sesión sin prolongar sesiones existentes. Las once migraciones históricas conservan sus hashes.
- `/demo` devuelve 404 antes del streaming de Next, incluyendo solicitudes RSC. Consultas operativas y documentos requieren sesión; las escrituras validan además origen, rutas permitidas y activación.
- Cookie `__Host-`, Secure, HttpOnly y SameSite Strict. Tokens aleatorios almacenados como hash; contraseña con scrypt. «Mantener sesión activa» fija 30 días absolutos; sin marcar conserva ocho horas y 30 minutos de inactividad. Logout y restablecimiento revocan ambos tipos. No guardar contraseña ni token en almacenamiento JavaScript.
- El propietario eligió una cuenta compartida; la auditoría identifica esa cuenta y no atribuye acciones individuales. La contraseña elegida se transmite mediante archivo privado, nunca mediante el repositorio o argumentos del aprovisionador.
- El worker no almacena respuestas operativas ni encola ventas sin conexión. Las notificaciones requieren opt-in; aceptación del proveedor no prueba recepción física. No se enviaron mensajes a clientes como parte de la revisión.
- API y PostgreSQL no publican puertos. La web preparada usa solo loopback 33101; alias y redes de producción son exclusivos. Los secretos se montan desde archivos privados, separados de staging y de la imagen.
- El cifrado externo usa AES-256-GCM y autentica también los metadatos del respaldo. La clave queda protegida por DPAPI del usuario Windows. El descifrador no emite bytes antes de verificar etiqueta, longitud, hash y manifiesto; una salida de proceso fallido no se consume.

## Hallazgos corregidos durante la revisión

1. Un dump ejecutado con el propietario limitado no podía recuperar íntegramente tablas con FORCE RLS. El respaldo completo usa el administrador local de la base exclusiva y mantiene separados los roles de aplicación/migración. La verificación de restauración también inspecciona sin filtrado de filas.
2. Excluir privilegios del dump dejaba incompleta una recuperación. El respaldo conserva ACL; la restauración crea los roles exactos y comprueba permisos de aplicación, ausencia de permisos públicos indebidos y políticas de fila.
3. El iniciador no propagaba `--reset` al aprovisionador. Ahora lo acepta exclusivamente para invitaciones y las pruebas comprueban el comportamiento.
4. El reinicio limitado de pruebas no cubría el reinicio del host. Solo los servicios de producción usan `unless-stopped`; su activación comercial continúa condicionada al archivo de control válido.
5. El ensayo local podía heredar configuración VAPID del operador. Ahora la elimina, fija loopback y verifica privilegios y membresías de los roles de QA antes de usarlos.

## Límites explícitos

El respaldo cifrado admite dumps de hasta 128 MiB y su clave depende del perfil Windows; no se declara una recuperación independiente tras perder también ese perfil. El mantenimiento del VPS no exporta automáticamente la copia externa ni envía alertas a terceros. Los registros de mantenimiento deben revisarse según el procedimiento documentado.

VES continúa bloqueado sin tasa oficial verificable. La naturaleza fiscal de los documentos y el procedimiento del negocio requieren validación externa. Ninguna de estas limitaciones se resuelve cargando fixtures o abriendo datos privados al público.
