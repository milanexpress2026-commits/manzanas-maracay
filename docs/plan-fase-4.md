# Fase 4: preparación de producción separada

Encargo autorizado: [brief de fase 4](referencias/brief-fase-4.txt). Base verificada en GitHub: `f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94`. Rama `phase-4/produccion-separada`; PRs 1 y 2 conservados sin merge. La preparación de producción está autorizada; cambiar el proxy compartido requiere aprobación específica del cambio terminado y comprobado.

## Decisiones confirmadas

- Producción usa PostgreSQL, volumen, roles, secretos y redes propios, sin datos de staging. Un almacén estructural vacío no equivale a inventario ni catálogo de muestra.
- Un acceso privado de dueños, utilizable en sus celulares y la tablet; no exigir cuentas individuales ni abrir datos anónimamente. Esta elección limita la atribución individual de la auditoría.
- Copia cifrada fuera del VPS en esta computadora, en carpeta privada fuera de Git. No se autorizó otro proveedor.
- USD operativo; VES exige fuente oficial verificada. No habilitar tasa arbitraria ni desactivar TLS. PDF comercial sin afirmación fiscal.
- La publicación conservará alias exclusivos: `mm-staging-web` y `mm-production-web`. No conectar nombres genéricos al proxy.

## Hitos y comprobaciones

| Hito                            | Estado al cierre local, 5 de noviembre de 2026       | Evidencia y siguiente comprobación                                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline actual                 | Aprobado nuevamente                                  | npm ci, typecheck, 90 unitarias, build, 53 E2E y once migraciones fresh/upgrade de la base de partida. La regresión de 53 E2E también pasó después de los cambios, en 4,8 minutos.                                           |
| Aislamiento en código y SQL     | Implementado y ensayado localmente                   | Entorno explícito, vínculo de base inmutable, rechazo cruzado DEMO/real, base nueva vacía y permisos mínimos comprobados en el ensayo HTTPS. Falta comprobar recursos remotos.                                               |
| Interfaz de operación           | Implementada y aprobada localmente                   | Raíz autenticada, demo 404, datos persistentes y estados vacíos, sesión opcional de 30 días, seis capturas y auditorías de accesibilidad. Tablet física pendiente.                                                           |
| Ensayo del modo production      | 12/12 aprobado                                       | Ejecución `67a94e711faec9abdb1bff9a`, 06:00:41–06:02:18 UTC: 2 escenarios vacíos, 4 UI y 6 API; 20 tablas comerciales inicialmente vacías, owner limitado y limpieza confirmada. Base exclusiva de QA, no producción remota. |
| Recursos de producción          | Configuración preparada; despliegue remoto pendiente | Compose propio, alias, redes, puerto local33101, secretos por archivo y controles de activación implementados. Verificar manifiesto exacto, capacidad, migraciones y recursos ajenos en VPS.                                 |
| Respaldo externo y recuperación | Procedimiento implementado; copia real pendiente     | Destino privado autorizado en esta computadora, cifrado DPAPI/AES-GCM y restore con ACL. Falta ejecutar y comprobar respaldo real, copia externa y restauración desde esa copia.                                             |
| Staging                         | Conservado; comparación remota de fase4 pendiente    | No promover su base ni reetiquetar datos sintéticos. Comprobar configuración, salud e imágenes antes/después.                                                                                                                |
| Publicación                     | Pendiente de controles y aprobación concreta         | No hay activación real ni cambio de tráfico autorizado. Preparar diff validado de Caddy, ruta y reversión, comprobar cuenta, respaldos y condiciones operativas.                                                             |

La [revisión visual](visual-review-fase-4.md), la [guía de operación](operacion-real.md), el [procedimiento de backup](backup-produccion.md) y el [despliegue](despliegue-produccion.md) detallan el alcance verificado. El resultado local no habilita por sí mismo la operación real. VES, revisión fiscal y prueba en Android/WhatsApp corporativo conservan sus límites en [pendientes comerciales](pendientes-comerciales.md).

## Reversión y puntos de control

Antes de cada mutación remota se identifica el recurso exclusivo y su estado. No se modifica staging para convertirlo a producción. La API de producción debe arrancar con escrituras comerciales bloqueadas hasta que exista la aprobación ligada a release, commit, instancia de base y origen. Salud del proceso y disponibilidad comercial son estados distintos.

Si falla la preparación, se conservan staging y las nuevas evidencias; no se restablecen bases mediante borrados ni se cambian recursos ajenos. Un futuro cambio de tráfico debe tener respaldo del archivo de proxy, validación previa y reversión del host de Manzanas solamente. Una migración ya aplicada no se reescribe. No activar escritores antiguos sobre un esquema incompatible.

El informe final separará código, ensayo local, staging verificado, recursos de producción preparados, acceso real habilitado y dependencias externas. Las pruebas históricas no se presentarán como ejecución nueva.
