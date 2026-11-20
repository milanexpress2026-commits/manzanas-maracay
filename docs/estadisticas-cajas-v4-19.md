# V4.19 — Estadísticas en cajas por vendedor y cliente

Estado: candidato final `90e4635ab80ca2db6d15e3a0a148a2a2e4f75075`, PR #20, preparado y saludable en staging. Estadísticas verificadas inicialmente en `336f58cc26a669fdf740f4566df69a0ab8022b30` y ampliadas con la cadena pública BCV detectada al activar staging. Producción continúa en V4.18, pendiente de autorización específica; este documento no autoriza publicación ni migración de alojamiento.

El propietario pidió una sección visible «Estadísticas» para ver qué mercancía vendieron Carlos y Randy, la variedad y el cliente. Aclaró que necesita un único total de cajas, por ejemplo 4,5, sin sumar manualmente cajas, medias y blísteres.

## Operación

- Acceso desde el menú y Ventas. Selector Todos/Carlos/Randy/Sin asignar, fechas Caracas, Hoy y Este mes.
- Total neto de cajas, importe vendido, ventas y clientes. Las cajas completas valen 1; las medias, 0,5; cada blíster vale 1 dividido por los blísteres de su lote histórico. Suma cada asignación no devuelta, incluso cuando una línea mezcla empaques distintos.
- Productos reúne las presentaciones en cajas por descripción/variedad/calibre. Clientes reúne sus compras. Ventas muestra producto, cajas, cliente, vendedor, fecha y enlace al comprobante. «Ver ventas» conserva fechas/vendedor y filtra ese producto o cliente.
- Se excluyen anulaciones y se descuentan las cantidades devueltas. Las ampliaciones conservan el vendedor y fecha original. Las anteriores sin vendedor siguen sin atribuirse.
- Es un resumen del estado actual de las ventas cuya fecha original cae en el período; no es un informe de movimientos ocurridos en las fechas ni de pagos cobrados durante ellas.
- Equivalencias en PostgreSQL `numeric`, agregadas antes de unir importes. Resultado redondeado a 12 decimales para eliminar residuos de división; presentación hasta cuatro decimales y «≈» cuando corresponde. Dinero conserva céntimos. Una equivalencia incompleta se informa explícitamente, nunca como total completo.

## Alcance técnico

GET privado `/api/sales/statistics`, una consulta bajo transacción de lectura repetible. Se reutilizan vistas vigentes y lotes; no se modifica stock, ventas, cobros ni esquema. Respuestas paginadas de 25 grupos, con totales calculados sobre el período completo. Índices existentes de fecha/vendedor, líneas, asignaciones y retornos. El resumen financiero anterior sigue accesible para consultar cobros/saldos.

No hay migración nueva: se conservan las veinte existentes. La preparación de publicación debe preservar todos los datos, acceso, tablet, DNS/Caddy y proyectos ajenos. Se requiere evidencia y autorización operativa sobre el candidato final antes de intervenir producción, conforme a la instrucción vigente del propietario.

## Evidencia

- Tipos iniciales aprobados.
- 475 unitarias existentes aprobadas; el primer arranque de Vitest fue impedido por `spawn EPERM` del aislamiento Windows y se repitió con permisos para sus procesos locales.
- Primera ejecución dirigida usó la compilación web anterior, por lo que la ruta nueva devolvió 404. Se conserva su evidencia; compilar y volver a probar antes de considerar los recorridos verificados.
- Segunda ejecución dirigida: cuatro recorridos pasaron; cuatro fallaron por datos de prueba incompletos (proveedor ausente y nombre no incluido en la respuesta de creación). Se corrigieron exclusivamente esas preparaciones/asserts; no se debilitó el contrato de la aplicación.
- Tercera ejecución dirigida: 8/8 aprobadas, con cajas/medias/blísteres, mezcla histórica de lotes, devoluciones, cancelaciones, clientes, paginación, medianoche Caracas, acceso privado y validación. Tres tamaños 390/800/1440 sin desbordamiento ni infracciones Axe. Base previa local intacta; proceso de QA detenido.
- Tipos y compilación API/web aprobados. Detector visual sin hallazgos; revisión independiente SHIP y documentación terminada.
- Regresión completa: **210/211** aprobadas, incluidas las ocho de estadísticas. Un recorrido antiguo V4.12 envió la hora del proceso de prueba, sin `dateMode: automatic`, y fue rechazado como futuro en la segunda media (línea76). Se conserva log y trace. Confirmación independiente del mismo archivo, sin cambiar código ni pruebas: **9/9**. No afirmar 211/211 en una sola ejecución. La interfaz real conserva la hora automática del servidor y sus pruebas de reloj adelantado/atrasado pasaron.
- Producción local aislada: **16** pruebas aprobadas, incluido el informe de cajas con rol de aplicación real, TLS y veinte migraciones. Base sintética retirada; base local previa intacta.
- Operadores privados: **6** controles aprobados. Cambio solo de código, historia de veinte migraciones idéntica, sin comando de migración y con comparación de todas las filas. Paquetes staging/producción preparados con el mismo SHA256 `1654ee61be37e71943c56a47b411f1b871ad0bd8a99314f98f9ec07a6d8c253a`; únicamente capturas documentales excluidas, ningún archivo de ejecución omitido.
- Respaldo previo de V4.18 cifrado en PC/VPS y restaurado aisladamente: PASS `2026-11-20T17:08:31.380391+00:00`. La producción sigue activa; se exigirá otro respaldo fresco durante la pausa autorizada.
- Preparación inicial de staging se detuvo por capturas locales regeneradas por E2E, antes de subir. Se retiraron solo esos cambios generados y se preparó el commit exacto. La preparación local de producción necesitó permisos para su carpeta privada; la repetición terminó correctamente, sin acceso remoto. La subida y compilación de staging conservaron los servicios anteriores y sus pares; activación en curso.

## Revisión documental de interfaz — 20/11/2026

- Se contrastaron `PRODUCT.md`, `DESIGN.md` y el contrato `apps/web/.impeccable/surfaces/rc-components-sales-statistics-screen-tsx-461965c6.md` con la ruta privada, `sales-statistics-screen.tsx`, su CSS, los tokens globales y los controles compartidos. Es una extensión Operate: conserva Manrope, verde/rojo/crema, logo, navegación, controles y radios existentes; no introduce un sistema visual ni recursos gráficos nuevos.
- La implementación cumple el contrato de lectura: un total de cajas equivalente, vendedor Todos/Carlos/Randy/Sin asignar, período Caracas, detalle por productos/clientes/ventas y filtro visible que puede quitarse. Carga, error, vacío y equivalencia parcial tienen mensajes explícitos. La comprobación numérica corresponde a las pruebas descritas arriba, no a esta revisión documental.
- Se inspeccionaron las capturas locales de pruebas `apps/web/.impeccable/review/mobile.png` (390), `user-800.png` (800) y `desktop.png` (1440): datos DEMO identificados, Randy seleccionado, total dominante de 4,5 cajas y detalle legible; registros apilados en teléfono/tablet y tabla en escritorio. Se registra el dictamen recibido del finish reviewer: **SHIP, sin hallazgos materiales** en esos tamaños. Esta revisión no acredita publicación ni dispositivos físicos.
- **Drift previo, fuera de esta extensión:** `PRODUCT.md` conserva referencias publicadas de fase 4/V4.5 y reglas antiguas de empaque; `DESIGN.md` mantiene descripciones históricas de costos/precios de fases anteriores. No se convirtieron esos antecedentes en requisitos nuevos ni se repararon. Se conservaron el canon, el brief, los metadatos y la fuente; la única escritura de este handoff es esta sección.

## Cadena BCV detectada en staging

La primera activación validó código, datos, esquema y servicios, pero el recolector rechazó la cadena TLS oficial. Conservó los datos y dejó solo staging detenido, con su cron pausado. USDT sí fue verificado; no se relajó la comprobación BCV ni se modificó producción.

El diagnóstico del VPS mostró una hoja `*.bcv.org.ve`, válida desde el 13/11/2026, emitida por **Sectigo Public Server Authentication CA OV R36**, junto con un intermedio antiguo no correspondiente. Se añadió el intermedio OV publicado por [Sectigo](https://www.sectigo.com/knowledge-base/detail/Access-New-Sectigo-Certificate-Chain), después de verificar su firma contra la raíz R46 ya incluida en Node, su vigencia y su huella. Se conserva DV para la otra cadena. Ambos se limitan a la petición BCV; no se desactiva TLS ni se añade una raíz nueva.

La lectura HTTPS real con el ajuste pasó y obtuvo la fecha valor del 20/11/2026. Tipos y **480 unitarias** aprobados, incluidas cinco pruebas de firmas, uso exclusivo de intermedios para BCV, rechazo TLS y lista de fuentes. Los ocho controles del procedimiento de recuperación específica de staging pasaron. Se recuperaron los mismos servicios, conservando filas, esquema, pares e incidente original, para avanzar al paquete corregido; esa recuperación no declaró sana la consulta BCV anterior. La interfaz, API de estadísticas, migraciones y lógica monetaria permanecen idénticas al candidato inicial; no corresponde repetir toda la regresión por este cambio aislado de cadena pública.

## Candidato final listo para autorización

- Paquete final `90e4635ab80ca2db6d15e3a0a148a2a2e4f75075`, SHA256 `939fb26a7811dc2b9756c457353aba33df08998317f1230a5285d3a017a07b0b`, idéntico para staging y producción. Compilación Docker de API/web/herramientas aprobada. La producción aún no recibió el paquete.
- Staging final saludable, todas las filas previas y las veinte migraciones conservadas, respaldos restaurados y cron reactivado. **BCV y USDT verificados** por el contenedor final; observación de salud/pares posterior al cron aprobada `2026-11-20T18:08:16.859490Z`.
- **22/22** controles autenticados de staging aprobados `2026-11-20T18:09:18.248225Z`, incluidos privacidad, lectura de estadísticas, filtro Carlos, tasas y revocación de la sesión de prueba. Sin operaciones comerciales sintéticas en producción.
- Respaldo de producción renovado al cerrar las verificaciones: cifrado PC/VPS, restauración aislada y limpieza verificadas, PASS `2026-11-20T18:09:14.053241+00:00`. Evidencia anterior conservada. Ver `verificacion-v4-19.json`.
- Para publicar: autorización del SHA final; subida/compilación, pausa temporal de la aplicación y procesos propios, respaldo cifrado fresco PC/VPS y restauración aislada, cambio solo de código y comprobación posterior. Conservar ventas, mercancía, clientes, acceso/tablet, DNS/Caddy y otros proyectos. No repetir vaciados ni migraciones.
