# Plan y matriz de Fase 3

Autorización expresa: «Ejecutar la fase 3 y actualizar staging», 4 de noviembre de 2026. Fuente: [brief completo](referencias/brief-fase-3.txt). Rama `phase-3/comercial-demo`, base `f9b532b75c1ffce668571dc7db0ed20b5a52c36f`. Sin merge ni producción.

## Estado actual

**Fase 3 implementada, verificada y desplegada en staging.** Typecheck/build aprobados, **90/90 unitarias** (11 archivos, 17,59 s) y **53/53 E2E** (4,3 min). El ensayo local fresh/upgrade de **once migraciones** conservó dieciséis tablas previas y seis hashes y retiró ambas bases temporales.

Release completa activa: `phase3-ef3d64616313`, commit de código **`ef3d64616313b3a5f2184f37365dc751da07af29`**, saludable el `2026-11-05T00:39:12.487397+00:00`. Web, API y esquema comerciales están habilitados. El [PR #2 sigue en borrador](https://github.com/milanexpress2026-commits/manzanas-maracay/pull/2) contra `phase-2/inventario-staging`, sin merge. Los commits posteriores de documentación no cambian el commit desplegado.

El [informe de staging](verificacion-staging-fase3.json) acredita migración remota de seis a once, preservación de catorce tablas previas salvo un evento de catálogo esperado, cuatro casos de smoke comercial, navegador externo, auditoría de infraestructura y respaldo/restauración posterior. Se conservó una caja DEMO de costo USD 25, con venta de USD 40 anulada, abono de USD 10 reversado y deuda cero; sin clientes reales ni mensajes. Cinco rondas GET antes/después mantuvieron Manzanas 200, Socios 302 y Pedal 200.

La demo temporal `demo-db16c5745423` del 4 de noviembre a las 23:33:21 UTC fue una publicación intermedia solo web y ya quedó sustituida. Su [informe](verificacion-demo-publica.json) se conserva como antecedente, separado del [navegador de la release completa](verificacion-fase3-browser.json).

## Baseline y evidencia vigente

- Antes de editar Fase 3 se renovaron typecheck, build, 23 unitarias y 32 E2E/API/PostgreSQL de Fase 2; todos aprobaron. Se preservó el PR #1 existente. Un intento restringido de Vitest produjo EPERM y se repitió con ejecución autorizada; ese fallo ambiental no se contó como prueba aprobada.
- La revisión inicial del VPS comprobó los tres contenedores propios saludables, API anónima 401, pantalla interna 307 y salud disponible. No modificó recursos remotos.
- Verificación final local de Fase 3: typecheck/build, 90 unitarias y 53 E2E aprobados. Incluye FIFO, pagos, integridad SQL, demo anónima, cuatro anchos, accesibilidad y pérdida de respuesta/reintento; los dos desbordes encontrados en la ejecución previa fueron corregidos.
- Migraciones 0000–0010: ensayo aprobado el `2026-11-04T22:54:14.556Z`–`22:54:29.414Z`, ejecución `2b09937b4ce6d75ddacd867c`. Fixture de Fase 2 conservó dos cajas + cuatro blíster, piezas null y costo 84 de 90 USD; véase [informe](verificacion-migraciones-fase3.json).
- Staging completo: release saludable a las 00:39:12 UTC del 5 de noviembre, navegador externo a las 00:41:20 UTC, restauración posterior a las 00:50:48 UTC y auditoría final a las 00:55:37 UTC; todos aprobados. PostgreSQL propio no se reinició/recreó. Diez contenedores ajenos conservaron identidades/imágenes/redes/puertos; el worker previamente reiniciándose no se declara saludable.
- PDF: tres documentos DEMO y ocho páginas renderizadas/inspeccionadas, incluido comprobante de cincuenta líneas. Evidencia en [pdf-qa-fase-3.md](pdf-qa-fase-3.md).

## Corrección durante la primera suite integrada

El error `42883` provenía de un alias JSON sin calificar que resolvía la columna textual `containers.state`; la migración aditiva `0010_commercial_json_alias.sql` usa valores JSON explícitos sin debilitar comprobaciones. El error `42501` provenía de pedir `FOR UPDATE` sobre documentos inmutables sin privilegio UPDATE; se retiró ese bloqueo redundante, conservando el bloqueo común del árbol y los triggers que serializan todas las escrituras comerciales. No se amplió el permiso de modificación de documentos.

Con rol `mm_app`, una venta a crédito y otra al contado pasaron validación completa de constraints y rollback en la base local de pruebas. Esto acredita la reproducción corregida, no un PASS de toda la suite. No se persistieron comprobantes ni saldos de esa depuración. La migración 0010 ya se aplicó localmente; el ensayo fresh/upgrade con once y los diez E2E comerciales aprobaron; la ejecución posterior corrigió los dos desbordes y aprobó 53/53.

## Matriz de funcionalidades

| Requisito                                  | Estado de implementación                                                                     | Verificación o dependencia pendiente                                                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo opcional y modalidades de empaque | Implementado: blíster, mitades comerciales y cajas; sin lógica por nombre de fruta.          | E2E integrado aprobado; confirmación de datos comerciales particulares pendiente.                                                                                                              |
| Snapshots y costo histórico                | Implementado: modalidad/peso/presentaciones y ledger de costo con precisión decimal.         | Migración fresh/upgrade y E2E de movimientos aprobados.                                                                                                                                        |
| Recepción y dos precios por presentación   | Implementado: conservación/actualización explícita dentro de la misma transacción.           | Conflictos entre líneas repetidas rechazados; regresión E2E aprobada.                                                                                                                          |
| FIFO y venta con stock                     | Implementado: mismo PoolClient/commit y asignación por recipiente, lote y costo.             | Casos exactos 304/480/176 y 3 cajas×5−1 en E2E.                                                                                                                                                |
| Clientes, venta y PDF                      | Implementado: snapshot, negociación, numeración comercial y documento privado.               | PDF visual y API/UI integrada aprobados. No factura fiscal.                                                                                                                                    |
| Crédito y fechas independientes            | Implementado: sin pago/fecha pactada obligatoria; eventos de reprogramación.                 | Unitarias y suite integrada aprobadas.                                                                                                                                                         |
| Abonos explícitos por comprobante          | Implementado: reparto exacto, recibo, idempotencia, bloqueo de sobrepago.                    | Concurrencia y pérdida de respuesta en suite integrada.                                                                                                                                        |
| BCV oficial                                | Caché validada y bloqueo seguro implementados.                                               | Fuente real no verificable; VES bloqueado sin registro válido. No inventar tasa ni desactivar TLS.                                                                                             |
| Cobranza y WhatsApp                        | Implementado: centro privado y chat manual con saldo actual.                                 | Validar perfil corporativo en tablet real. No autoenvíos.                                                                                                                                      |
| Push de una tablet                         | Backend/PWA implementados con opt-in, reemplazo explícito, deduplicación y avisos genéricos. | VAPID desplegado; cero dispositivos activos confirmados. Opt-in y entrega física en Android pendientes; límites iOS documentados.                                                              |
| Demo pública                               | Implementada con datos sintéticos estáticos; no consulta API privada ni crea sesión.         | E2E adversarial, demo externa y API comercial completa aprobados en staging; privados protegidos.                                                                                              |
| Diseño, movimiento y accesibilidad         | Implementados marca, navegación y formularios responsive; reducción de movimiento.           | Cuatro anchos, 30 vistas/axe y vídeo aprobados; cuatro muestras de rendimiento. Dispositivo real pendiente.                                                                                    |
| Skills y revisión de seguridad             | Selección fijada, skill propia de integridad y revisión documentadas.                        | Revisión final incorporada, sin hallazgos explotables pendientes; 94 hashes de skills verificados. Límites documentados en [skills.md](skills.md) y [seguridad](revision-seguridad-fase-3.md). |
| Staging y respaldo                         | Release completa activa; PostgreSQL y recursos ajenos conservados.                           | Smoke, auditoría y respaldo/restauración posterior aprobados; copia segura fuera del VPS pendiente.                                                                                            |

## Hitos secuenciales

1. **Revisión inicial — completada.** Fuentes comerciales, repositorio, baseline renovado y estado previo del VPS.
2. **Modelo e integridad — implementados y verificados localmente.** Once migraciones fresh/upgrade, costo trazable, datos históricos preservados y E2E aprobados.
3. **Recepción y precios — implementados.** Formulario contextual y confirmación atómica. Conflictos entre líneas repetidas rechazados y regresión E2E aprobada.
4. **Ventas FIFO — implementadas y verificadas localmente.** Clientes, negociación, asignaciones, stock y documentos; PDF visual y descarga integrada aprobados.
5. **Abonos y cobranza — desplegados y verificados.** USD operativo y comprobado por HTTPS, incluidos recibo y reversa. VES exige fuente oficial válida; push requiere opt-in y comprobación física en la tablet.
6. **Demo pública activa y experiencia visual verificada.** Navegador externo fresco aprobado; 30 vistas, 30 auditorías axe, vídeo real de 17,56 s y cuatro muestras de rendimiento documentados en [revisión visual](visual-review-fase-3.md). Dispositivos físicos pendientes.
7. **Staging comercial completo — desplegado y verificado.** PR #2 en borrador, release trazable, once migraciones, smoke propio, sesión segura, auditoría de recursos y restauración aislada posterior aprobados. No hubo merge ni publicación de producción.

## Decisiones de integridad

- Una sola fuente de stock. Comercio comparte transacción con el motor físico; no invoca otro commit para el descuento.
- Empaque configurable: `blister`, `halves`, `whole`; mitad `counted`, `commercial`, `pending`, `none`. Variedad/calibre opcionales y línea comercial separada.
- Caja y media tienen cantidades enteras separadas. Una media comercial conserva recipiente remanente; no crea 0,5 caja cerrada ni piezas ficticias.
- Listas promo/normal independientes por presentación y costo de compra. NUMERIC/Decimal, costos a cuatro decimales y residuo final conservado.
- Documentos confirmados y ledger inmutables; correcciones mediante eventos/compensaciones admisibles. Sin devoluciones parciales improvisadas.
- Demo sin base privada; aplicación interna con sesión, origen y clave de proxy. La publicidad del código no publica datos del negocio.
- Solo la coordinación principal ejecuta servicios, suite integrada, migraciones y despliegue; trabajo paralelo por archivos coordinados. No editar código mientras corre la suite sin coordinar.
- Aplicar la skill `manzanas-inventory-integrity` y registrar resultados actuales. Ninguna skill amplía permisos sobre infraestructura compartida.

## Condiciones operativas y datos pendientes

Blíster por variedad/calibre; calibres de cada variedad; Lady/Pink Lady; media de pera; mandarina y devoluciones particulares. El sistema conserva configuración pendiente y bloquea lo que dependa del dato ausente. Solo USD/VES, sin fiscalidad SENIAT ni otros medios no confirmados.

No declarar producción lista: faltan copia segura fuera del VPS, evaluación fiscal y pruebas en dispositivos reales. La autenticación interna, separación de demo, integridad transaccional y restauración ya aprobaron para esta release de staging. Conservar alias exclusivo `mm-staging-web`. Cambios de DNS/proxy/firewall/red compartida requieren autorización específica, aunque la demo sea pública. Ante un fallo futuro, seguir el procedimiento propio de reversión; no iniciar escritores de fase 2 sobre el esquema de fase 3.
