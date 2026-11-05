# Archivo histórico: tasa oficial BCV en fase 3

Este documento conserva la investigación, implementación y pruebas de **fase 3**, realizadas el 4 y 5 de noviembre de 2026. Sus referencias a actualización automática sin configurar, bloqueo VES y activación futura describen aquella entrega; no constituyen el estado vigente del hotfix.

Para las reglas actuales de BCV y USDT, la verificación de QA y la release efectivamente comprobada, consultar el [informe del hotfix UX v3](hotfix-ux-v3.md) y las [reglas de dominio](domain-rules.md). Un recolector implementado o una prueba local satisfactoria no acreditan su activación en staging ni en producción. El informe del hotfix registra esos resultados cuando existe evidencia.

## Resultado de la investigación

El 4 de noviembre de 2026 se consultaron exclusivamente las fuentes oficiales [www.bcv.org.ve](https://www.bcv.org.ve/) y [bcv.org.ve](https://bcv.org.ve/). La herramienta web devolvió 502. Una comprobación independiente con Node `fetch`, HTTPS y verificación normal de certificados falló en ambas con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, a las 21:38 UTC. No se desactivó TLS ni se sustituyó la fuente por un tercero.

No se pudo verificar valor, HTML ni vigencia de una publicación oficial actual. Tampoco se identificó una API oficial accesible y documentada. Por ello no se implementa un scraper basado en selectores supuestos y no se presenta una tasa de prueba como real. La actualización automática permanece sin configurar. Los resultados describen la observación de este entorno y momento; no afirman que el sitio oficial esté permanentemente caído.

En la release desplegada `phase3-ef3d64616313` (commit `ef3d64616313b3a5f2184f37365dc751da07af29`), el [smoke autenticado](verificacion-staging-fase3.json) confirmó BCV no disponible. **Los cobros VES siguen bloqueados; las operaciones USD están habilitadas.** La nueva salida de red de API para push no activa un recolector BCV ni verifica una tasa por sí sola. No se incorporó una tasa real o sintética en staging para sortear este bloqueo.

## Comportamiento implementado

`BcvService` implementa el contrato existente `OfficialRateProvider`, leyendo exclusivamente la tabla privada e inmutable `bcv_rates`. `getCurrent(at)` devuelve el registro y su identidad histórica, o `null`; no acepta un valor de tasa enviado por el navegador. La consulta usa el instante del cobro suministrado por el servicio de negocio, nunca la zona horaria del navegador.

- Se exige un único candidato para el intervalo `[valid_from, valid_until)`. Dos registros simultáneamente vigentes bloquean la conversión.
- Se comprueban origen HTTPS BCV exacto, huella SHA-256, verificador, tasa positiva, fechas válidas y `fetched_at <= verified_at <= instante_del_cobro`.
- Una tasa futura, vencida, ambigua, ausente o una caché inaccesible retorna no disponible. No se reutiliza silenciosamente la última tasa conocida.
- La caché vigente puede utilizarse durante una caída de la fuente únicamente si ya fue verificada. En esta entrega no hay un proceso que inserte tasas reales; no hay endpoint de escritura ni tasa precargada en staging.
- `GET /api/rates/current` permanece privado bajo sesión. Devuelve `available` con registro histórico o `unavailable` con un mensaje para continuar cobros USD. El rol de aplicación solo necesita `SELECT` sobre `bcv_rates`.
- El cálculo VES/USD utiliza Decimal y redondeo explícito a centavos. La venta y deuda conservan su denominación USD; el cobro guarda tasa, moneda original y equivalente histórico.

No se asigna una duración de 24 horas a una publicación por suposición. Los límites de vigencia deben proceder de una verificación oficial antes de incorporar un registro. Los intervalos de los tests son sintéticos y están confinados a pruebas.

## Activación futura de verificación

Requiere volver a comprobar conexión TLS, fuente oficial y semántica de fecha valor, incluidos fines de semana, publicaciones anticipadas y cambios intradía. El extracto deberá conservar URL exacta, hash del contenido original, momento de consulta, responsable/proceso de verificación y validez acreditada. Debe rechazar cambios inesperados del documento, valores múltiples, redirecciones a terceros, tiempo de espera y cuerpos excesivos. Una verificación manual controlada es una opción a decidir con el propietario; no está activada ni se solicita una tasa por chat.

## Evidencia y límites

`tests/unit/bcv.test.ts` contiene 18 casos focalizados de metadatos, ambigüedad, origen, valor, fechas, cambio de día Caracas, caída de caché y redondeo VES. Se ejecutaron satisfactoriamente durante la implementación. Los fixtures jamás se cargan mediante semillas ni endpoints. El E2E comercial local acreditó tasa histórica y deuda USD estable al introducir una tasa sintética posterior, dentro de su base aislada de pruebas; la batería integrada aprobó 90 unitarias y 53 E2E.

El smoke publicado realizó una venta y un abono DEMO en USD, verificó idempotencia y comprobantes, y compensó las operaciones conservando auditoría y stock. Confirmó el estado BCV no disponible; no efectuó un cobro VES con tasa oficial. Los resultados están separados de la investigación de la fuente y se registran en [entrega-fase-3.md](entrega-fase-3.md) y [staging.md](staging.md). Ninguna de esas pruebas sustituye la verificación de una publicación BCV real.
