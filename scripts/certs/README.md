# Certificados intermedios públicos de BCV

V4.19 añade `sectigo-public-server-ov-r36.pem`, **Sectigo Public Server Authentication CA OV R36**, SHA-256 DER `6542d176bed50f193c0ce297ae44ecd8a0a86bec2ede682769344059b4e78530`. El 20/11/2026 se observó desde el VPS una hoja `*.bcv.org.ve` emitida por OV R36, válida desde el 13/11/2026, acompañada por un intermedio antiguo de otro emisor. Se obtuvo el intermedio de la [URL oficial de Sectigo](http://crt.sectigo.com/SectigoPublicServerAuthenticationCAOVR36.crt), publicada en su documentación HTTPS y en el AIA de la hoja. Se verificó su firma contra **Sectigo Public Server Authentication Root R46**, ya presente en las raíces de Node, huella `7bb647a62aeeac88bf257aa522d01ffea395e0ab45c73f93f65654ec38f25a06`. El intermedio es CA, no es raíz/hoja, y vence el 21/03/2036. Se conserva DV para servidores que todavía usan esa cadena; ambos tienen excepciones exactas en `.dockerignore` y huellas verificadas al cargar.

`sectigo-public-server-dv-r36.pem` es el certificado público **Sectigo Public Server Authentication CA DV R36**. No contiene una clave privada ni es el certificado del negocio.

El 5 de noviembre de 2026, BCV respondió correctamente con la cadena completada por Windows, mientras Node/Linux rechazaban la cadena incompleta presentada por su servidor. Se exportó el intermedio de esa cadena validada; su SHA-256 DER es `8c54c334b66ba4e426772af4a3f9136c19a1aec729fdb28c535c07a5a4ef22e0` y vence el 21 de marzo de 2036.

Fuente de la autoridad emisora: [cadena pública de Sectigo](https://www.sectigo.com/knowledge-base/detail/Access-New-Sectigo-Certificate-Chain).

El recolector comprueba la huella y añade únicamente este intermedio a las raíces estándar de Node para la petición a `https://www.bcv.org.ve/`. Conserva la verificación de hostname, firma, fechas y raíz. No desactiva TLS, no confía en el certificado hoja y no modifica la confianza global del sistema ni otras peticiones.

## Empaquetado V4 y staging anterior

V4 incluye en la imagen de herramientas únicamente este certificado público mediante una excepción exacta en `.dockerignore`. Los demás PEM y todas las claves privadas siguen excluidos. La huella DER se comprueba dentro del recolector antes de cada ejecución. Producción no necesita montar una carpeta ni un archivo del host para completar esta cadena.

La release anterior de staging `hotfix-8612e8230bb5` excluía todos los PEM. En esa release el despliegue proporciona el certificado como un montaje individual **de solo lectura**, desde el archivo de la release cuyo hash ya se verificó, hasta `/app/scripts/certs/sectigo-public-server-dv-r36.pem`. Se conserva aquí el procedimiento para reproducir esa evidencia histórica; no se modifica la imagen publicada.

La ejecución de `docker compose run` del recolector añade la opción siguiente, sustituyendo `RUTA_RELEASE_VERIFICADA` por la ruta absoluta de la release activa comprobada:

```text
--volume RUTA_RELEASE_VERIFICADA/scripts/certs/sectigo-public-server-dv-r36.pem:/app/scripts/certs/sectigo-public-server-dv-r36.pem:ro
```

Esta opción va antes del nombre de servicio `rate-refresh`. El origen debe ser un archivo regular de root, sin symlinks, con permisos 0644 y el hash del manifiesto de la release comprobado. El programa vuelve a comprobar la huella DER dentro del contenedor antes de consultar una fuente. La ausencia o alteración del archivo detiene la recolección; no activa una excepción de TLS.

Si cambia la cadena, el recolector debe fallar cerrado hasta verificar la nueva evidencia. No sustituir el archivo por un certificado descargado sin validar su cadena y procedencia.
