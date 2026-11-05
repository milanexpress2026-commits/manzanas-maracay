# Continuar Manzanas Maracay — fase 4

Repositorio: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama phase-4/produccion-separada, basada en f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94. Verificar HEAD y PR actuales; conservar los PR anteriores sin merge indiscriminado. Este documento no contiene credenciales.

**Cierre local del 5 de noviembre de 2026:** producción separada implementada y ensayada, 12/12 escenarios HTTPS aislados aprobados y regresión existente 53/53 E2E aprobada. Preparación remota, respaldo externo real, activación y cambio concreto de tráfico pendientes. La URL objetivo es https://manzanas.ganamosclub.net; su existencia o la demo histórica no acreditan producción activa. Consultar avances posteriores en [entrega de fase4](entrega-fase-4-produccion.md) y [verificación local](verificacion-fase4-local.json).

## Prompt para copiar

```text
Continúa Manzanas Maracay, aplicación de una distribuidora venezolana de frutas importadas. Responde en español y distingue código, ensayo local, staging comprobado, producción desplegada y acceso real habilitado.

Repositorio: https://github.com/milanexpress2026-commits/manzanas-maracay
Rama: phase-4/produccion-separada
Base: f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94
URL objetivo: https://manzanas.ganamosclub.net

El propietario autorizó ejecutar fase4 y preparar producción separada. Continúa sin pedir autorización genérica otra vez. Todavía NO autorizó el cambio concreto de Caddy/DNS/red compartida ni el cutover: prepara evidencias, diff validado y reversión antes de pedir esa aprobación específica. No marques LIVE por pruebas locales. Conserva historia y PRs, sin merge o forcepush indiscriminados. Si evidencia posterior acredita permisos o trabajo terminado, no lo repitas.

Lee AGENTS.md, PRODUCT.md, DESIGN.md, docs/domain-rules.md, docs/inventory-model.md, docs/plan-fase-4.md, docs/entrega-fase-4-produccion.md, docs/verificacion-fase4-local.json, docs/verificacion-migraciones-fase4.json, docs/revision-seguridad-fase-4.md, docs/visual-review-fase-4.md, docs/operacion-real.md, docs/backup-produccion.md, docs/despliegue-produccion.md, docs/pendientes-comerciales.md, docs/fiscalidad-fase-4.md y docs/skills.md. Verifica versión efectiva; evidencia de fase3 no acredita fase4.

Producción explícita en servidor/API/SQL/cookies/PWA. Proyecto manzanas-maracay-production, base nueva manzanas_maracay_production, volumen, roles, redes y secretos propios. No promover staging ni copiar ejemplos o cambiar DEMO a real. Vínculo inmutable de entorno/base/roles/UUID; datos comerciales reales comienzan vacíos. La raíz dirige a login o /inicio; todo /demo responde404, incluso RSC. Datos y mutaciones requieren sesión.

Un único acceso privado compartido por propietarios en celulares/tablet, sin cuentas individuales. Credenciales elegidas solo en archivo privado, nunca Git/chat/logs. Mantener sesión activa es opcional y desmarcada:30d absolutos; normal8h e inactividad30min. Sin contraseña en almacenamiento web. Logout y renovación de contraseña revocan sesiones.

Sin activation.json válido, login/lecturas permitidos y mutaciones comerciales bloqueadas. Activación ligada a commit/release/origen/UUID y evidencia verdadera de respaldo externo, restore, cuenta, aislamiento, infraestructura y alcance no fiscal. Health no equivale a apertura. No falsear controles.

PostgreSQL mantiene ledger físico/costo único; venta/FIFO/egreso/abono inicial/auditoría/idempotencia atómicos. Dinero NUMERIC/Decimal, costo cuatro decimales. No stock paralelo ni reescritura de hechos. Calibre no cuenta fruta; null no es cero; recipiente abierto no se suma a sus hijos; no venta por pieza. Empaques según capacidades. Configuraciones pendientes bloquean recepción/venta real. Amarilla distinta de Gala; Lady/PinkLady y cantidades no confirmadas pendientes. Granel con medias comerciales; kiwi10kg/5kg; uva solo caja; no inventar pera/mandarina.

Listas y precio pactado independientes del costo. Crédito permite pago inicial cero sin asiento cero. Abonos explícitos por comprobante, sin sobrepago ni reparto automático de excedentes. Fecha pactada y recordatorio independientes, America/Caracas. PDF comercial no fiscal, sin costos internos al cliente. VES bloqueado sin BCV oficial verificado vigente: no omitir TLS ni usar fixtures. USD no necesita conversión.

WhatsApp manual: operador envía. Push exige opt-in de una tablet y claves nuevas de producción. Simulación no prueba entrega física; Android, perfil corporativo y fiscalidad siguen pendientes. No mensajes ni notificaciones reales sin autorización y opt-in.

QA final run67a94e711faec9abdb1bff9a, 2026-11-05T06:00:41–06:02:18UTC: 2empty+4UI+6API=12/12PASS, 20tablas comerciales vacías iniciales, owner limitado y limpieza confirmada. UI: proveedor/fruta/empaque/20cajas costo25/listas/cliente/crédito2cajas total80/abono30/saldo50, PDF, resumen18cajas y1venta. Solo base sintética QA. Seis capturas390/800/1024/1440px y axe en vistas especificadas; no tablet física ni rendimiento VPS. Regresión53/53PASS4.8min. Consultar JSON para demás evidencias. No suites ni resets contra remoto.

Compose: alias mm-production-web, loopback127.0.0.1:33101, API/base sin puertos publicados. Nunca alias genérico web: causó colisión histórica con Socios. No reiniciar apps ajenas, borrar volúmenes, prune o resetear staging. Producción PG/API/web unless-stopped; herramientas no; staging sin cambios.

Backup completo mediante administrador local propio bajo FORCE RLS, owner/API limitados, no-owner pero CONSERVAR ACL. Restore aislado verifica filas ocultas, permisos, stock/costos/saldos. Exigir exit0 completo además .ok, incluida limpieza. Copia externa autorizada en carpeta privada de esta computadora fuera de Git, AES256GCM/DPAPI CurrentUser, límite128MiB. DPAPI depende del PC/perfil: falta recuperación independiente. Cifrar no prueba restaurar: comprobar descifrado autenticado y restore desde copia externa. No inventar otro destino.

Completa preparación remota autorizada: manifiesto exacto, recursos exclusivos, secretos nuevos, base vacía, gate cerrado, backup previo/posterior, copia externa/restore, cuenta privada y comparación de staging y rutas reales de terceros. Prepara diff mínimo Caddy, validación y reversión; después pide autorización concreta faltante para cambiar tráfico. No declares producción publicada hasta verificarla.
```
