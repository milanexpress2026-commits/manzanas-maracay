# Certificado intermedio público de BCV

`sectigo-public-server-dv-r36.pem` es el certificado público **Sectigo Public Server Authentication CA DV R36**. No contiene una clave privada ni es el certificado del negocio.

El 5 de noviembre de 2026, BCV respondió correctamente con la cadena completada por Windows, mientras Node/Linux rechazaban la cadena incompleta presentada por su servidor. Se exportó el intermedio de esa cadena validada; su SHA-256 DER es `8c54c334b66ba4e426772af4a3f9136c19a1aec729fdb28c535c07a5a4ef22e0` y vence el 21 de marzo de 2036.

Fuente de la autoridad emisora: [cadena pública de Sectigo](https://www.sectigo.com/knowledge-base/detail/Access-New-Sectigo-Certificate-Chain).

El recolector comprueba la huella y añade únicamente este intermedio a las raíces estándar de Node para la petición a `https://www.bcv.org.ve/`. Conserva la verificación de hostname, firma, fechas y raíz. No desactiva TLS, no confía en el certificado hoja y no modifica la confianza global del sistema ni otras peticiones.

## Contenedor de staging

`.dockerignore` excluye los archivos PEM del contexto de imagen. El despliegue proporciona este certificado público como un montaje individual **de solo lectura**, desde el archivo de la release cuyo hash ya se verificó, hasta `/app/scripts/certs/sectigo-public-server-dv-r36.pem`. No se monta una carpeta de secretos ni se modifica la imagen publicada.

La ejecución de `docker compose run` del recolector añade la opción siguiente, sustituyendo `RUTA_RELEASE_VERIFICADA` por la ruta absoluta de la release activa comprobada:

```text
--volume RUTA_RELEASE_VERIFICADA/scripts/certs/sectigo-public-server-dv-r36.pem:/app/scripts/certs/sectigo-public-server-dv-r36.pem:ro
```

Esta opción va antes del nombre de servicio `rate-refresh`. El origen debe ser un archivo regular de root, sin symlinks, con permisos 0644 y el hash del manifiesto de la release comprobado. El programa vuelve a comprobar la huella DER dentro del contenedor antes de consultar una fuente. La ausencia o alteración del archivo detiene la recolección; no activa una excepción de TLS.

Si cambia la cadena, el recolector debe fallar cerrado hasta verificar la nueva evidencia. No sustituir el archivo por un certificado descargado sin validar su cadena y procedencia.
