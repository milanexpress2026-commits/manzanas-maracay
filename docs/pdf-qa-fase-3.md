# Comprobantes digitales: verificación visual de fase 3

El generador de la aplicación creó tres documentos sintéticos con `scripts/capture-commerce-pdfs.ts`: comprobante de venta de una página, recibo de abono de una página y comprobante de cincuenta líneas extensas de seis páginas. Todos llevan DEMO; ninguna muestra representa una operación del negocio ni se insertó en una base.

Se renderizaron con Poppler y se inspeccionaron las ocho páginas. Se corrigió una línea divisoria que rozaba el texto de la fila siguiente y se añadió la repetición de encabezados al cambiar de página. La inspección final comprobó logo intacto, acentos del español, textos completos, márgenes, encabezados, numeración, importes y ausencia de superposiciones o recortes.

- [Comprobante de venta](capturas/fase3-pdf-venta.png)
- [Recibo de abono](capturas/fase3-pdf-abono.png)
- [Cincuenta líneas: primera página](capturas/fase3-pdf-50-lineas-primera.png)
- [Cincuenta líneas: última página](capturas/fase3-pdf-50-lineas-ultima.png)

Los documentos se rotulan COMPROBANTE DE VENTA y RECIBO DE ABONO. El pie aclara que no son facturas fiscales SENIAT. La fecha usa America/Caracas, los precios unitarios conservan cuatro decimales y los totales usan dos con Decimal. Los costos de compra y la ganancia interna no se imprimen en el comprobante del cliente. El recibo conserva el saldo al registrar cada aplicación; el comprobante de venta muestra el saldo actual al consultarlo.

Se utilizan fuentes PDF estándar que cubren español y el logo PNG original; cada muestra pesa aproximadamente 2,1 MB. Los caracteres no representables en WinAnsi se sustituyen por `?` únicamente en la representación PDF; el dato original permanece en PostgreSQL. La descarga binaria y los controles de sesión pertenecen a las pruebas de integración; esta revisión visual del generador no sustituye esos escenarios.

Los PDF y los ocho PNG de inspección permanecen en `.local/pdf-qa`, fuera de Git. Las cuatro imágenes enlazadas son evidencia pública sintética. El generador no interpreta HTML, no ejecuta contenido del cliente, no descarga recursos externos y no construye rutas a partir de datos del documento.
