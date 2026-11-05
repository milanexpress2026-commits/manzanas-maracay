# Revisión de aislamiento y acceso — fase 4

Revisión de implementación, pruebas dirigidas y procedimientos propios. No sustituye una auditoría exhaustiva ni acredita por sí sola el despliegue remoto. El estado ejecutado se registra en [entrega](entrega-fase-4-produccion.md).

Código revisado: `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`, rama `phase-4/produccion-separada`, [PR #3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/3). La release phase4-2a81817fe2c1 está desplegada y saludable con operación cerrada, sin gate de activación ni cambio de URL pública. Acceso y copia externa restaurable ya están verificados.

## Controles revisados

- Producción se valida en servidor y se vincula a una instancia PostgreSQL exclusiva. No basta cambiar una etiqueta del navegador. El arranque rechaza conexión, roles o vínculo incompatibles; reiniciar una base legítima con datos no exige vaciarla.
- La migración aditiva `0011` preserva historia, impide cambiar las marcas DEMO y aplica políticas de fila forzadas. La migración `0012` añade la preferencia de sesión sin prolongar sesiones existentes. Las once migraciones históricas conservan sus hashes.
- `/demo` devuelve 404 antes del streaming de Next, incluyendo solicitudes RSC. Consultas operativas y documentos requieren sesión; las escrituras validan además origen, rutas permitidas y activación.
- Cookie `__Host-`, Secure, HttpOnly y SameSite Strict. Tokens aleatorios almacenados como hash; contraseña con scrypt. «Mantener sesión activa» fija 30 días absolutos; sin marcar conserva ocho horas y 30 minutos de inactividad. Logout y restablecimiento revocan ambos tipos. No guardar contraseña ni token en almacenamiento JavaScript.
- La invitación y la derivación de la contraseña usan el mismo `passwordCreationSchema`, con longitud de 8 a 256 caracteres. La comprobación de login conserva el límite máximo compartido, sin convertir ni sustituir la contraseña elegida.
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
6. El aprovisionador aceptaba una invitación de nueve caracteres, pero `hashPassword` conservaba un mínimo independiente de catorce y rechazaba su derivación. Se eliminó esa regla duplicada: ambos usan `passwordCreationSchema`. La regresión deriva y verifica una contraseña sintética generada de nueve caracteres, rechaza otra contraseña y bloquea siete caracteres. El ensayo HTTPS también aprovisiona e inicia sesión con una contraseña sintética de nueve caracteres; nunca usa la credencial real del propietario.

## Evidencia de esta revisión

El contenido confirmado en `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0` pasó typecheck, build y 137 pruebas unitarias. El ensayo del modo producción pasó 12/12 escenarios, ejecución `15e7b61dec37a0978b7f3451`, del 5 de noviembre de 2026 a las 07:54:15.489–07:56:43.984 UTC. Se ejecutó con la corrección en el árbol de trabajo antes del commit final; su informe conserva `baseCommit: 49044263d6f74940e388817179ba6df3eff1f8ba`. La base temporal quedó retirada (`databaseCleaned: true`). Incluye aprovisionamiento, autenticación, persistencia de sesión, revocación, aislamiento y operaciones comerciales únicamente en una base exclusiva de QA.

La regresión de 53 E2E corresponde al commit anterior `49044263d6f74940e388817179ba6df3eff1f8ba`, con la misma interfaz. No se presenta como una ejecución nueva sobre `2a81817fe2c17130c07b47b04b98c6ce7aaf59b0`; la corrección posterior de contraseña se verificó mediante las pruebas unitarias y los 12 escenarios de producción indicados arriba.

## Evidencia remota de preparación cerrada

La inicialización confirmó 13 migraciones, 19 tablas comerciales vacías, una cuenta legítima, cero filas DEMO, integridad de costos/comercio, denegación anónima y ausencia de rutas demo. Contenedores preexistentes conservados y proxy sin cambios. Auth smoke del 5 de noviembre a las 08:31:41 UTC verificó login, cookie persistente segura, sesión con operación cerrada, resumen vacío y logout con rechazo de la cookie anterior. Push está configurado sin dispositivo suscrito y no se enviaron avisos.

La copia externa real quedó verificada a las 08:32:19 UTC: AES-256-GCM/DPAPI CurrentUser, descifrado y restauración aislada desde la copia, con limpieza. No se creó un dump local sin cifrar ni se hicieron escrituras comerciales en producción. La [proyección pública](verificacion-produccion-fase4.json) omite credenciales y UUID de instancia. El candidato Caddy pasó la validación aislada a las 09:05:46.355571 UTC, con contexto público PORTAL_DOMAIN=socios.ganamosclub.net comprobado, recursos temporales retirados, configuración compartida intacta y contenedores preexistentes conservados. El diff solo cambia el upstream de Manzanas de mm-staging-web:3100 a mm-production-web:3100. Estos resultados no activan operaciones: la aprobación concreta está solicitada y sin respuesta; red, tráfico, activación y cron siguen sin cambios.

## Límites explícitos

El respaldo cifrado admite dumps de hasta 128 MiB y su clave depende del perfil Windows; no se declara una recuperación independiente tras perder también ese perfil. El mantenimiento del VPS no exporta automáticamente la copia externa ni envía alertas a terceros. Los registros de mantenimiento deben revisarse según el procedimiento documentado.

VES continúa bloqueado sin tasa oficial verificable. La naturaleza fiscal de los documentos y el procedimiento del negocio requieren validación externa. Ninguna de estas limitaciones se resuelve cargando fixtures o abriendo datos privados al público.
