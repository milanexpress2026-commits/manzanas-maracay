# Plan y matriz de Fase 3

Autorización expresa: «Ejecutar la fase 3 y actualizar staging», 4 de noviembre de 2026. Fuente: [brief completo](referencias/brief-fase-3.txt). Rama `phase-3/comercial-demo`, base `f9b532b75c1ffce668571dc7db0ed20b5a52c36f`. Sin merge ni producción.

## Estado actual

La implementación está integrada y verificada localmente: typecheck/build aprobados, **90/90 unitarias** (11 archivos, 17,59 s) y **53/53 E2E** (4,3 min). El ensayo fresh/upgrade de **once migraciones** conservó 16 tablas previas y seis hashes y retiró ambas bases temporales. El despliegue comercial de Fase 3 permanece pendiente.

La última release de staging comprobada continúa siendo `phase2-7ae1d75`, commit `7ae1d7504d31623e771fba5015361ae04ca9a4ef`. Sus endpoints internos siguen protegidos. HEAD local y documentación de Fase 3 no equivalen al código publicado. [entrega-fase-3.md](entrega-fase-3.md) mantiene la matriz de veinte casos y [staging.md](staging.md) la release efectivamente verificada.

Preview web temporal: rama `phase-3/demo-publica-temporal`, commit `db16c574542347cc15c89498184873b9e5953d84` ya publicado en GitHub. Transferencia VPS en curso al corte; conserva API y esquema de Fase 2. No equivale al despliegue completo de la fase.

## Baseline y evidencia vigente

- Antes de editar Fase 3 se renovaron typecheck, build, 23 unitarias y 32 E2E/API/PostgreSQL de Fase 2; todos aprobaron. Se preservó el PR #1 existente. Un intento restringido de Vitest produjo EPERM y se repitió con ejecución autorizada; ese fallo ambiental no se contó como prueba aprobada.
- La revisión inicial del VPS comprobó los tres contenedores propios saludables, API anónima 401, pantalla interna 307 y salud disponible. No modificó recursos remotos.
- Verificación final local de Fase 3: typecheck/build, 90 unitarias y 53 E2E aprobados. Incluye FIFO, pagos, integridad SQL, demo anónima, cuatro anchos, accesibilidad y pérdida de respuesta/reintento; los dos desbordes encontrados en la ejecución previa fueron corregidos.
- Migraciones 0000–0010: ensayo aprobado el `2026-11-04T22:54:14.556Z`–`22:54:29.414Z`, ejecución `2b09937b4ce6d75ddacd867c`. Fixture de Fase 2 conservó dos cajas + cuatro blíster, piezas null y costo 84 de 90 USD; véase [informe](verificacion-migraciones-fase3.json).
- PDF: tres documentos DEMO y ocho páginas renderizadas/inspeccionadas, incluido comprobante de cincuenta líneas. Evidencia en [pdf-qa-fase-3.md](pdf-qa-fase-3.md).

## Corrección durante la primera suite integrada

El error `42883` provenía de un alias JSON sin calificar que resolvía la columna textual `containers.state`; la migración aditiva `0010_commercial_json_alias.sql` usa valores JSON explícitos sin debilitar comprobaciones. El error `42501` provenía de pedir `FOR UPDATE` sobre documentos inmutables sin privilegio UPDATE; se retiró ese bloqueo redundante, conservando el bloqueo común del árbol y los triggers que serializan todas las escrituras comerciales. No se amplió el permiso de modificación de documentos.

Con rol `mm_app`, una venta a crédito y otra al contado pasaron validación completa de constraints y rollback en la base local de pruebas. Esto acredita la reproducción corregida, no un PASS de toda la suite. No se persistieron comprobantes ni saldos de esa depuración. La migración 0010 ya se aplicó localmente; el ensayo fresh/upgrade con once y los diez E2E comerciales aprobaron; la ejecución posterior corrigió los dos desbordes y aprobó 53/53.

## Matriz de funcionalidades

| Requisito                                  | Estado de implementación                                                                     | Verificación o dependencia pendiente                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Catálogo opcional y modalidades de empaque | Implementado: blíster, mitades comerciales y cajas; sin lógica por nombre de fruta.          | E2E integrado aprobado; confirmación de datos comerciales particulares pendiente.                  |
| Snapshots y costo histórico                | Implementado: modalidad/peso/presentaciones y ledger de costo con precisión decimal.         | Migración fresh/upgrade y E2E de movimientos aprobados.                                            |
| Recepción y dos precios por presentación   | Implementado: conservación/actualización explícita dentro de la misma transacción.           | Conflictos entre líneas repetidas rechazados; regresión E2E aprobada.                              |
| FIFO y venta con stock                     | Implementado: mismo PoolClient/commit y asignación por recipiente, lote y costo.             | Casos exactos 304/480/176 y 3 cajas×5−1 en E2E.                                                    |
| Clientes, venta y PDF                      | Implementado: snapshot, negociación, numeración comercial y documento privado.               | PDF visual y API/UI integrada aprobados. No factura fiscal.                                        |
| Crédito y fechas independientes            | Implementado: sin pago/fecha pactada obligatoria; eventos de reprogramación.                 | Unitarias y suite integrada aprobadas.                                                             |
| Abonos explícitos por comprobante          | Implementado: reparto exacto, recibo, idempotencia, bloqueo de sobrepago.                    | Concurrencia y pérdida de respuesta en suite integrada.                                            |
| BCV oficial                                | Caché validada y bloqueo seguro implementados.                                               | Fuente real no verificable; VES bloqueado sin registro válido. No inventar tasa ni desactivar TLS. |
| Cobranza y WhatsApp                        | Implementado: centro privado y chat manual con saldo actual.                                 | Validar perfil corporativo en tablet real. No autoenvíos.                                          |
| Push de una tablet                         | Backend/PWA implementados con opt-in, reemplazo explícito, deduplicación y avisos genéricos. | VAPID externo, suscripción voluntaria y entrega real Android/iOS pendientes.                       |
| Demo pública                               | Implementada con datos sintéticos estáticos; no consulta API privada ni crea sesión.         | E2E adversarial aprobado; incógnito externo posterior al despliegue pendiente.                     |
| Diseño, movimiento y accesibilidad         | Implementados marca, navegación y formularios responsive; reducción de movimiento.           | Suite 390/800/1024/1440 aprobada y capturas disponibles; grabación/dispositivo real pendientes.    |
| Skills y revisión de seguridad             | Selección fijada, skill propia de integridad y revisión documentadas.                        | Incorporar resultados finales y resolver hallazgos verificables; ver [skills.md](skills.md).       |
| Staging y respaldo                         | Infraestructura exclusiva previa conservada; release de Fase 3 pendiente.                    | Respaldo/restauración y smoke de nueva release; copia segura fuera del VPS pendiente.              |

## Hitos secuenciales

1. **Revisión inicial — completada.** Fuentes comerciales, repositorio, baseline renovado y estado previo del VPS.
2. **Modelo e integridad — implementados y verificados localmente.** Once migraciones fresh/upgrade, costo trazable, datos históricos preservados y E2E aprobados.
3. **Recepción y precios — implementados.** Formulario contextual y confirmación atómica. Conflictos entre líneas repetidas rechazados y regresión E2E aprobada.
4. **Ventas FIFO — implementadas y verificadas localmente.** Clientes, negociación, asignaciones, stock y documentos; PDF visual y descarga integrada aprobados.
5. **Abonos y cobranza — implementados con dependencias.** USD operativo en código; VES depende de fuente oficial válida. Push depende de configuración y tablet opt-in. Prueba física pendiente.
6. **Demo y experiencia visual — implementadas y verificadas en Chromium local.** Rutas sintéticas aisladas, cuatro tamaños, accesibilidad y capturas disponibles. Grabación/revisión física pendientes.
7. **Verificación local completada; staging pendiente.** Preparación de preview temporal web publicada en GitHub y transferencia VPS en curso, sin API/esquema nuevos. Falta ensayo de restauración/smoke y release comercial trazable sin merge.

## Decisiones de integridad

- Una sola fuente de stock. Comercio comparte transacción con el motor físico; no invoca otro commit para el descuento.
- Empaque configurable: `blister`, `halves`, `whole`; mitad `counted`, `commercial`, `pending`, `none`. Variedad/calibre opcionales y línea comercial separada.
- Caja y media tienen cantidades enteras separadas. Una media comercial conserva recipiente remanente; no crea 0,5 caja cerrada ni piezas ficticias.
- Listas promo/normal independientes por presentación y costo de compra. NUMERIC/Decimal, costos a cuatro decimales y residuo final conservado.
- Documentos confirmados y ledger inmutables; correcciones mediante eventos/compensaciones admisibles. Sin devoluciones parciales improvisadas.
- Demo sin base privada; aplicación interna con sesión, origen y clave de proxy. La publicidad del código no publica datos del negocio.
- Solo la coordinación principal ejecuta servicios, suite integrada, migraciones y despliegue; trabajo paralelo por archivos coordinados. No editar código mientras corre la suite sin coordinar.
- Aplicar la skill `manzanas-inventory-integrity` y registrar resultados actuales. Ninguna skill amplía permisos sobre infraestructura compartida.

## Datos y aprobación todavía pendientes

Blíster por variedad/calibre; calibres de cada variedad; Lady/Pink Lady; media de pera; mandarina y devoluciones particulares. El sistema conserva configuración pendiente y bloquea lo que dependa del dato ausente. Solo USD/VES, sin fiscalidad SENIAT ni otros medios no confirmados.

No declarar producción lista: faltan copia segura fuera del VPS, evaluación fiscal y pruebas en dispositivos reales. Para publicar Fase 3 deben pasar la autenticación interna, separación de demo, integridad transaccional y restauración. Conservar alias exclusivo `mm-staging-web`. Cambios de DNS/proxy/firewall/red compartida requieren autorización específica, aunque la demo sea pública. Si la comprobación de infraestructura falla, conservar/restaurar únicamente la release propia anterior.
