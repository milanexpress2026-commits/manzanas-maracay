# Fase 4 — producción publicada y operación interna en USD

La producción está publicada y activa para la operación interna en USD, con acceso privado y documentos comerciales no fiscales. La activación autorizada pasó el 5 de noviembre de 2026 a las 12:04:09.980676 UTC; autenticación pública a las 12:04:59.976130 UTC y mantenimiento a las 12:05:58.497181 UTC. [Entrar al sistema](https://manzanas.ganamosclub.net/login).

Rama: `phase-4/produccion-separada`, basada en `f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94`. Los PR #1 y #2 se conservan sin merge. Código actual publicado: 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0, [PR #3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/3). Este es el código desplegado en phase4-2a81817fe2c1; los commits posteriores de documentación no cambian esa release.

## A. Implementado en código

Modo `production` validado por servidor; base, roles, volumen, secretos y redes propios; vínculo inmutable de instancia; aislamiento DEMO/real y bloqueo de operaciones antes de activación. El inicio lleva al acceso privado o al tablero con datos reales y estados vacíos. `/demo` devuelve 404 en producción. Onboarding permite ingresar proveedor, fruta/configuración confirmada, recepción, precios, cliente y venta.

Se preservan las transacciones de inventario/costos/FIFO, crédito, abonos y compensaciones. No se carga catálogo, precios, stock ni clientes ficticios en producción. Los PDFs son comprobantes comerciales y no facturas fiscales. VES exige tasa oficial verificable; no se habilita una tasa arbitraria.

El propietario eligió una cuenta privada compartida y sus credenciales mediante un archivo privado fuera del repositorio. La opción **Mantener sesión activa** conserva el acceso durante 30 días; sin marcar mantiene ocho horas y 30 minutos de inactividad. Cerrar sesión o restablecer la contraseña revoca ambas modalidades. No hay contraseñas ni tokens en localStorage.

La corrección más reciente centraliza la validación de contraseña de 8 a 256 caracteres para crear y renovar el acceso, evitando reglas distintas entre los recorridos de provisión. No modifica la interfaz ni publica las credenciales elegidas.

## B. Ensayado localmente

- Baseline renovado: instalación de dependencias, tipos, build, 90 unitarias, 53 E2E y once migraciones fresh/upgrade.
- Código actual 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0: **137 unitarias en 13 archivos**, tipos y build aprobados.
- Trece migraciones fresh/upgrade aprobadas: 35 tablas históricas y once hashes previos preservados, dos cajas más cuatro blíster y costo remanente USD 84. Ambas bases temporales fueron retiradas. [Informe ejecutado](verificacion-migraciones-fase4.json).
- Regresión completa: **53/53 E2E** aprobados en 4,8 minutos sobre la base local exclusiva con la implementación 49044263d6f74940e388817179ba6df3eff1f8ba. No se repitió esa suite después de la corrección de contraseña.
- Ensayo HTTPS repetido tras la corrección: **12/12 casos** (dos de base vacía/acceso, cuatro de UI y seis de API), incluidos FIFO 304/480/176, abonos concurrentes, reversas, aislamiento, gate y sesiones persistentes. Run 15e7b61dec37a0978b7f3451, 2026-11-05 07:54:15.489–07:56:43.984 UTC; limpieza de la base temporal confirmada. El reporte conserva 49044263d6f74940e388817179ba6df3eff1f8ba como commit base del ensayo; la corrección probada quedó publicada después en 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0. [Informe](verificacion-fase4-local.json).
- Revisión visual: seis capturas del run 67a94e711faec9abdb1bff9a, con anchos de 390, 800, 1024 y 1440 px. La interfaz es idéntica tras la corrección; no se atribuye a esa revisión anterior una prueba física de Android ni una verificación remota. [Revisión](visual-review-fase-4.md).
- Cifrado Windows: once comprobaciones de integridad, autenticación y permisos aprobadas con datos sintéticos. Esas pruebas sintéticas no acreditan por sí solas una copia real; la copia de producción y su restauración externa están verificadas por separado en la sección D.

## C. Staging verificado

Staging phase3-ef3d64616313 se conserva internamente mediante loopback 33100; ya no es la aplicación principal del dominio. El control histórico previo al cambio, a las 08:43:31 UTC, verificó 13 contenedores preexistentes intactos y tres propios. En ese momento el proxy era idéntico y /demo respondía 200; esas condiciones describen el precorte, no el estado actual. Tras la activación, las rutas anteriores y aplicaciones compartidas se preservaron y el proxy no se reinició. /demo responde HTTP 404 en producción.

Durante una comprobación HTTP previa al respaldo apareció un resultado transitorio que detuvo la preparación antes de iniciar API/web; quince GET posteriores fueron correctos y después la inicialización terminó. No se atribuye una causa sin evidencia. El control final posterior fue correcto; cualquier futuro cambio del proxy requiere otra comparación antes/después.

## D. Producción remota

Release phase4-2a81817fe2c1, código 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0, desplegada en /opt/manzanas-maracay/production; proyecto manzanas-maracay-production, base manzanas_maracay_production y web mm-production-web por loopback 33101. API y base no publican puertos. La activación final confirma ready=true. [Evidencia pública](verificacion-produccion-fase4.json), con preparación histórica separada de los controles posteriores al cambio.

| Comprobación remota                         | Estado documentado                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release desplegada y salud                  | phase4-2a81817fe2c1, saludable, 13 migraciones y ready=true; activación autorizada verificada a las 12:04:09 UTC                                                                                                       |
| Cuenta privada y base comercial vacía       | Estado inicial: 19 tablas comerciales vacías, una cuenta legítima y cero DEMO. Verificación pública a las 12:04:59 UTC: HTTPS estricto, login, cookie de 30 días, sesión activa y logout con cookie anterior rechazada |
| Respaldo real, copia externa y restauración | Verificados a las 08:32:19 UTC: copia local AES-256-GCM/DPAPI, restauración desde esa copia y limpieza aislada; sin archivo local de dump sin cifrar ni escrituras comerciales reales                                  |
| Staging y otras aplicaciones conservados    | Rutas anteriores y aplicaciones compartidas preservadas en la activación final. Staging interno en loopback 33100; proxy sin reiniciar                                                                                 |
| Activación y cambio de tráfico              | Autorizados y aplicados: upstream de Manzanas hacia mm-production-web:3100 y conexión a su red propia. Candidato validado y gate instalado; producción pública activa                                                  |

La validación histórica de Caddy terminó a las 09:05:46.355571 UTC y solo propuso cambiar mm-staging-web:3100 por mm-production-web:3100 para Manzanas. Después de la aprobación específica se aplicó ese cambio. El primer intento de activación abortó antes de configuración/gate por una lectura de rutas de BusyBox y deshizo la conexión propia; se corrigió esa medición del operador y el segundo intento pasó sin cambiar el código de aplicación.

El mantenimiento propio pasó a las 12:05:58.497181 UTC. Se instaló únicamente /etc/cron.d/manzanas-maracay-production con el ejemplo exacto, tras verificar identidad, fuente, activación, respaldo/restauración y monitor. No cambió otros cron ni reinició servicios. Monitor cada cinco minutos y un intento diario de backup con restore entre 01:00 y 01:59 de America/Caracas. La ejecución manual inicial pasó y el primer monitor programado se observó saludable a las 12:10:01 UTC; la lectura de control fue a las 12:12:01 UTC. Esto no acredita todavía la próxima ejecución diaria del respaldo. Copia externa, alertas a terceros y eliminación de respaldos no están automatizadas.

## E. Acceso real

La URL operativa es [manzanas.ganamosclub.net/login](https://manzanas.ganamosclub.net/login). El propietario aprobó expresamente publicar y habilitar la operación interna en USD, con documentos comerciales no fiscales. La raíz dirige al login o al inicio privado según sesión; los datos y documentos siguen protegidos. La verificación pública acreditó acceso, sesión activa y revocación al salir. No se crearon ventas o cobros reales para probar el despliegue: los escenarios comerciales se ejecutaron en QA aislado. Los propietarios pueden comenzar a registrar sus datos auténticos.

## F. Pendientes externos

1. La clave DPAPI depende de este PC/perfil: falta recuperación independiente ante su pérdida. Copia externa periódica, alertas externas y retención automática no están implementadas.
2. BCV oficial no verificable desde este entorno; **cobro en VES no operativo**. [Evidencia de fuentes](verificacion-fuentes-fase4.json).
3. El propietario informó que aún no tiene procedimiento fiscal. Falta verificar texto oficial, vigencia y aplicación con asesor contable; los PDFs mantienen naturaleza comercial. [Fiscalidad](fiscalidad-fase-4.md).
4. Opt-in y entrega en la tablet Android real, perfil corporativo de WhatsApp y confirmación de configuraciones comerciales antes de vender las presentaciones dependientes de ellas.

Procedimientos: [operación](operacion-real.md), [respaldo](backup-produccion.md), [despliegue](despliegue-produccion.md), [decisiones comerciales](pendientes-comerciales.md) y [revisión de aislamiento](revision-seguridad-fase-4.md).
