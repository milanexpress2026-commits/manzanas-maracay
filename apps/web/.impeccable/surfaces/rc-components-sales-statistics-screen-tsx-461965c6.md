---
version: 1
slug: "rc-components-sales-statistics-screen-tsx-461965c6"
primary_target: "apps/web/src/components/sales-statistics-screen.tsx"
related_targets: ["apps/web/src/app/estadisticas/page.tsx","apps/web/src/components/sales-statistics.module.css"]
---

# Estadísticas de ventas — V4.19

Modo: Operate. Extensión precisa del resumen existente: los dueños necesitan un total único de cajas, variedad y cliente, con selector Carlos/Randy y período de Venezuela. La aclaración del usuario pide 4,5 cajas en vez de separar medias y blísteres. Conserva marca, controles y navegación. Solo lectura, sin nuevos datos operativos.

## Direction contract

THESIS: la mercancía en cajas es la primera respuesta; el detalle permite saber a quién y qué se vendió. No exige sumar presentaciones mentalmente.

OWN-WORLD: hereda Manrope, verde bosque, crema, bordes y controles del sistema existente. Interfaz clara para teléfono y tablet bajo luz del local.

STORY: elegir vendedor y fechas, leer cajas netas, alternar productos/clientes/ventas y abrir el comprobante. Las devoluciones se restan; el empaque histórico convierte los blísteres.

FIRST VIEWPORT: título Estadísticas, vendedor y período, total de cajas dominante con dinero/ventas secundarios. Después una tabla de productos que se convierte en registros legibles en móvil. Los filtros de detalle pueden quitarse con un botón visible.

FORM: extensión directa especificada por el usuario; no corresponde sorteo de concepto ni seed. Interacción distintiva: Ver ventas desde producto o cliente lleva al detalle del mismo período/vendedor.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
