# Fase 4 — producción separada en preparación

La implementación distingue producción real de staging y pruebas, comienza con datos comerciales vacíos y conserva acceso privado. La verificación local está aprobada y la nueva producción está desplegada, saludable y cerrada. Acceso y copia externa restaurable están comprobados; todavía no se activaron operaciones ni cambió la URL pública.

Rama: `phase-4/produccion-separada`, basada en `f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94`. Los PR #1 y #2 se conservan sin merge. Código actual publicado: 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0, [PR #3](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/3). Este SHA no acredita una release remota activada.

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

Se conserva la release phase3-ef3d64616313 en la URL actual. El control final previo al cambio de tráfico del 5 de noviembre a las 08:43:31 UTC verificó 16 contenedores: los 13 preexistentes sin cambios de identidad, arranque, imagen, redes ni demás atributos comprobados, y tres propios de producción. No había contenedores previos con salud anómala; el hash del proxy y las rutas se mantuvieron iguales. Manzanas staging y Pedal respondieron HTTP 200; Socios redirigió a su acceso con HTTP 302. La ruta /demo continuó respondiendo HTTP 200 porque el dominio sigue en staging.

Durante una comprobación HTTP previa al respaldo apareció un resultado transitorio que detuvo la preparación antes de iniciar API/web; quince GET posteriores fueron correctos y después la inicialización terminó. No se atribuye una causa sin evidencia. El control final posterior fue correcto; cualquier futuro cambio del proxy requiere otra comparación antes/después.

## D. Producción remota

Release phase4-2a81817fe2c1, commit 2a81817fe2c17130c07b47b04b98c6ce7aaf59b0, desplegada en /opt/manzanas-maracay/production; proyecto manzanas-maracay-production, base manzanas_maracay_production y web mm-production-web por loopback 33101. Salud verificada con ready=false: las escrituras comerciales siguen cerradas. [Proyección pública de las tres verificaciones](verificacion-produccion-fase4.json), sin credenciales ni identificador privado de instancia.

| Comprobación remota                         | Estado documentado                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release desplegada y salud                  | phase4-2a81817fe2c1, saludable; ready=false y 13 migraciones                                                                                                                                                                |
| Cuenta privada y base comercial vacía       | 19 tablas comerciales vacías, una cuenta legítima y cero filas DEMO. Prueba de autenticación aprobada a las 08:31:41 UTC: acceso, sesión de 30 días, operación cerrada y cierre de sesión con rechazo de la cookie anterior |
| Respaldo real, copia externa y restauración | Verificados a las 08:32:19 UTC: copia local AES-256-GCM/DPAPI, restauración desde esa copia y limpieza aislada; sin archivo local de dump sin cifrar ni escrituras comerciales reales                                       |
| Staging y otras aplicaciones conservados    | Control de las 08:43:31 UTC aprobado: 13 contenedores previos intactos, 3 propios, ninguno previo con salud anómala, hash del proxy y rutas sin cambios; Manzanas y Pedal con HTTP 200, Socios con HTTP 302                 |
| Activación y cambio de tráfico              | Candidato de Caddy validado a las 09:05:46 UTC, limpieza confirmada y proxy intacto. Aprobación concreta solicitada y sin respuesta; no hay conexión de red, activación, cambio de URL ni cron                              |

El candidato validado cambia únicamente el upstream del host Manzanas: mm-staging-web:3100 → mm-production-web:3100. La validación aislada reprodujo el contexto público PORTAL_DOMAIN=socios.ganamosclub.net; no conectó redes al proxy ni recargó su configuración. Se preservaron los contenedores preexistentes. La [evidencia pública](verificacion-produccion-fase4.json) incluye la hora exacta de finalización, 09:05:46.355571 UTC, y los hashes del archivo original y candidato, sin identificadores de contenedores ni comandos privados.

## E. Acceso real

La URL deseada es [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net). Recursos, acceso y respaldo externo ya tienen evidencia; el candidato del proxy ya está validado y falta recibir la aprobación concreta solicitada antes de ejecutarlo. La URL conserva la versión de pruebas. No se dirigió tráfico comercial al entorno nuevo ni se hicieron ventas o cobros reales como smoke.

## F. Pendientes externos

1. Respuesta a la autorización específica ya solicitada para el cambio de proxy/red compartida; el diff, la validación aislada y la reversión están preparados.
2. BCV oficial no verificable desde este entorno; **cobro en VES no operativo**. [Evidencia de fuentes](verificacion-fuentes-fase4.json).
3. El propietario informó que aún no tiene procedimiento fiscal. Falta verificar texto oficial, vigencia y aplicación con asesor contable; los PDFs mantienen naturaleza comercial. [Fiscalidad](fiscalidad-fase-4.md).
4. Opt-in y entrega en la tablet Android real, perfil corporativo de WhatsApp y confirmación de configuraciones comerciales antes de vender las presentaciones dependientes de ellas.

Procedimientos: [operación](operacion-real.md), [respaldo](backup-produccion.md), [despliegue](despliegue-produccion.md), [decisiones comerciales](pendientes-comerciales.md) y [revisión de aislamiento](revision-seguridad-fase-4.md).
