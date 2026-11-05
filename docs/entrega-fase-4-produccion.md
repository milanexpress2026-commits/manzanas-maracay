# Fase 4 — producción separada en preparación

La implementación distingue producción real de staging y pruebas, comienza con datos comerciales vacíos y conserva acceso privado. La verificación local está aprobada; la preparación remota todavía no acredita publicación ni operaciones reales.

Rama: `phase-4/produccion-separada`, basada en `f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94`. Los PR #1 y #2 se conservan sin merge. El PR de esta fase se abrirá con la revisión comprobada.

## A. Implementado en código

Modo `production` validado por servidor; base, roles, volumen, secretos y redes propios; vínculo inmutable de instancia; aislamiento DEMO/real y bloqueo de operaciones antes de activación. El inicio lleva al acceso privado o al tablero con datos reales y estados vacíos. `/demo` devuelve 404 en producción. Onboarding permite ingresar proveedor, fruta/configuración confirmada, recepción, precios, cliente y venta.

Se preservan las transacciones de inventario/costos/FIFO, crédito, abonos y compensaciones. No se carga catálogo, precios, stock ni clientes ficticios en producción. Los PDFs son comprobantes comerciales y no facturas fiscales. VES exige tasa oficial verificable; no se habilita una tasa arbitraria.

El propietario eligió una cuenta privada compartida y sus credenciales mediante un archivo privado fuera del repositorio. La opción **Mantener sesión activa** conserva el acceso durante 30 días; sin marcar mantiene ocho horas y 30 minutos de inactividad. Cerrar sesión o restablecer la contraseña revoca ambas modalidades. No hay contraseñas ni tokens en localStorage.

## B. Ensayado localmente

- Baseline renovado: instalación de dependencias, tipos, build, 90 unitarias, 53 E2E y once migraciones fresh/upgrade.
- Implementación nueva: `npm run check` aprobado, con **136 unitarias en 13 archivos**, tipos y build.
- Trece migraciones fresh/upgrade aprobadas: 35 tablas históricas y once hashes previos preservados, dos cajas más cuatro blíster y costo remanente USD 84. Ambas bases temporales fueron retiradas. [Informe ejecutado](verificacion-migraciones-fase4.json).
- Regresión completa: **53/53 E2E** aprobados en 4,8 minutos sobre la base local exclusiva.
- Ensayo HTTPS del modo producción: **12/12 casos** (dos de base vacía/acceso, cuatro de UI y seis de API), incluidos FIFO 304/480/176, abonos concurrentes, reversas, aislamiento, gate y sesiones persistentes. Run `67a94e711faec9abdb1bff9a`, 2026-11-05 06:00:41–06:02:18 UTC; base temporal retirada y PostgreSQL detenido. [Informe](verificacion-fase4-local.json).
- Cifrado Windows: once comprobaciones de integridad, autenticación y permisos aprobadas con datos sintéticos. Esto todavía no acredita una copia real fuera del VPS.

## C. Staging verificado

Se conserva la release `phase3-ef3d64616313` en la URL actual. El preflight de esta fase verificó su salud, once migraciones e integridad sin modificarla. Los GET de Manzanas y Pedal respondieron 200; Socios redirigió a su acceso con 302. Los controles posteriores a la preparación remota se incorporarán a la evidencia final.

## D. Producción remota

Procedimiento preparado para `/opt/manzanas-maracay/production`, proyecto `manzanas-maracay-production`, base `manzanas_maracay_production` y web `mm-production-web`, publicada únicamente en loopback 33101. Todavía no se acredita despliegue ni respaldo real de esta base. La herramienta no crea el archivo de activación ni modifica Caddy/DNS/redes compartidas.

## E. Acceso real

La URL deseada es [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net). Hasta comprobar recursos, respaldo externo, cuenta y autorización concreta del cambio de proxy, esa URL conserva la versión de pruebas. No se dirigió tráfico comercial al entorno nuevo ni se ejecutaron transacciones reales como smoke.

## F. Pendientes externos

1. Autorización específica del cambio de proxy/red compartida, después de preparar el diff validado y la reversión.
2. BCV oficial no verificable desde este entorno; **cobro en VES no operativo**. [Evidencia de fuentes](verificacion-fuentes-fase4.json).
3. El propietario informó que aún no tiene procedimiento fiscal. Falta verificar texto oficial, vigencia y aplicación con asesor contable; los PDFs mantienen naturaleza comercial. [Fiscalidad](fiscalidad-fase-4.md).
4. Opt-in y entrega en la tablet Android real, perfil corporativo de WhatsApp y confirmación de configuraciones comerciales antes de vender las presentaciones dependientes de ellas.

Procedimientos: [operación](operacion-real.md), [respaldo](backup-produccion.md), [despliegue](despliegue-produccion.md), [decisiones comerciales](pendientes-comerciales.md) y [revisión de aislamiento](revision-seguridad-fase-4.md).
