# Respaldos y recuperación de producción

## Estado de esta preparación

**Respaldo real externo verificado:** la copia de phase4-2a81817fe2c1 se cifró en esta computadora mediante AES-256-GCM y DPAPI CurrentUser, se descifró y se restauró en un entorno aislado el 5 de noviembre de 2026 a las 08:32:19 UTC. El resultado confirma copia externa, restauración desde esa copia y limpieza; no se creó un archivo local de dump sin cifrar ni se registraron operaciones comerciales. La base respaldada estaba comercialmente vacía y tenía una cuenta legítima. [Evidencia pública](verificacion-produccion-fase4.json).

La copia de producción corresponde exclusivamente a `manzanas_maracay_production`, del proyecto Docker `manzanas-maracay-production`. No se copia staging para comenzar a operar. Los archivos de respaldo contienen información privada: permanecen fuera del repositorio, del directorio servido por la web y de las imágenes Docker.

## Crear y comprobar el respaldo en el VPS

El operador utiliza [production-backup.sh](../scripts/production-backup.sh) desde la release exacta, con `MM_COMMIT` completo y `MM_RELEASE=phase4-<SHA12>` definidos. El destino previsto es `/opt/manzanas-maracay/production/backups`, privado `0700` y propiedad del operador. El script comprueba proyecto, servicio, contenedor único, volumen `manzanas-maracay-production_mm_production_pg`, PostgreSQL 18, roles y vínculo de la base antes de leer datos.

```bash
bash scripts/production-backup.sh /opt/manzanas-maracay/production/backups
```

Cada ejecución crea un nombre nuevo con fecha UTC y sufijo aleatorio, un dump custom `PGDMP`, metadatos `.meta` formato 2, hash SHA-256 y registro privado. No sobrescribe copias anteriores. `--uninitialized` es una excepción exclusiva para el respaldo previo a la primera migración: exige cero tablas en `public` y `drizzle`; no permite omitir las verificaciones de una base operativa. Conservar las copias anterior y posterior a una migración.

El dump usa `mm_prod_bootstrap` por el socket local del contenedor propio para incluir todas las filas bajo `FORCE ROW LEVEL SECURITY`. `mm_prod_owner` y `mm_prod_app` continúan sin `SUPERUSER`, `BYPASSRLS`, creación de roles ni creación de bases. La credencial administrativa no se entrega a la API. Usar el owner con un dump filtrado por RLS podría omitir datos; no es un sustituto válido.

El formato usa `--no-owner`, **pero conserva las ACL**: no agregar `--no-privileges` al respaldo ni a la restauración. Los permisos de lectura, escritura y registros inmutables forman parte del resultado que debe recuperarse.

Después, pasar la ruta absoluta exacta del `.dump` a [production-restore-check.sh](../scripts/production-restore-check.sh):

```bash
bash scripts/production-restore-check.sh /ruta/privada/al/respaldo.dump
```

El ensayo crea un contenedor y volumen temporales exclusivos, sin red ni puertos, con la imagen PostgreSQL registrada en los metadatos. Conserva el nombre de base y UUID originales dentro de ese entorno aislado. Crea roles limitados, restaura como `mm_prod_owner` en una sola transacción y conserva las ACL. La inspección administrativa de solo lectura verifica todas las filas, incluidas las que RLS podría ocultar al owner.

Se comprueban vínculo de entorno, presencia del registro de migraciones, restricciones, roles y permisos, `FORCE RLS`, ausencia de datos DEMO, límites de acceso compartido, existencias, costos, versiones, movimientos, ventas, pagos y saldos mediante [production-verify-restore.sql](../scripts/production-verify-restore.sql). El contraste de hashes exactos de migraciones corresponde a la verificación de despliegue por separado. Exigir código de salida cero del proceso completo, además del `.ok` y el log privado: el `.ok` se escribe antes de la limpieza y puede existir aunque esa limpieza falle. La limpieza elimina únicamente los recursos temporales cuyo nombre y etiquetas coinciden con el ensayo; no elimina el volumen original.

## Copia cifrada fuera del VPS

El destino preparado en Windows es `C:\Users\gordis\Documents\Codex\Backups-privados\Manzanas-Maracay`, fuera de Git. [offsite-backup-windows.ps1](../scripts/offsite-backup-windows.ps1) requiere Windows con PowerShell 7.2 o posterior y AES-GCM disponible. Rechaza enlaces y directorios dentro de un repositorio; las ACL permiten únicamente al usuario Windows actual y `SYSTEM`.

1. Ejecutar la acción `PrepareDirectory` con `-Database manzanas_maracay_production`. Solo prepara y comprueba el directorio privado; no crea una clave.
2. Transferir el `.meta` del respaldo a ese directorio por el canal privado autorizado, conservando sus bytes y permisos. No pegar su contenido ni el dump en el chat.
3. Ejecutar `Encrypt`, con el `.meta` en `-ManifestFile`, alimentando el dump por **stdin binario redirigido**. El script no admite un archivo de dump sin cifrar en `-InputFile`. El transporte debe comprobar sus códigos de salida y mantener los bytes intactos; no usar `Get-Content`, conversión a texto ni una tubería que recodifique el dump.
4. Comprobar salida exitosa y el archivo `.mmbackup` nuevo. El cifrado es AES-256-GCM; el hash, longitud, identificación de base y manifiesto formato 2 quedan autenticados. La respuesta `restoreVerified=false` es intencional: cifrar no demuestra que PostgreSQL pueda restaurar.
5. Ejecutar `Decrypt -InputFile <ruta privada .mmbackup>` con **stdout binario redirigido** hacia el proceso de recuperación autorizado. El script no emite bytes del dump antes de validar autenticación, hash, longitud y manifiesto. Descartar cualquier salida de un proceso que no termine con código cero.
6. Solo después de ese éxito, usar el manifiesto autenticado incluido en el sobre para reconstruir el `.meta` asociado y repetir el ensayo aislado con el dump recuperado. Registrar hash, identificación del ensayo y resultado sin publicar los datos comerciales. Esta vuelta completa acredita la copia externa, no la mera existencia del archivo cifrado.

La clave AES se genera durante el primer cifrado y se guarda cifrada en `backup-key.dpapi.json` mediante **DPAPI CurrentUser**. Está en el mismo directorio privado que las copias, ligada al perfil y al equipo Windows: copiar ese JSON a otro equipo no garantiza poder abrirlo. Perder el equipo o el perfil sin material independiente de recuperación puede volver las copias irrecuperables. Este mecanismo no constituye por sí solo una estrategia de recuperación ante pérdida de ese PC; acordar y verificar una recuperación independiente antes de depender exclusivamente de él.

El tamaño máximo del dump sin cifrar es **128 MiB** y el script trabaja en memoria. Si se supera, falla: no dividir arbitrariamente el dump ni aumentar el límite sin revisar memoria, formato y un nuevo ensayo. El cifrado no transporta archivos por sí mismo, no sube datos a un proveedor y no automatiza copias fuera del VPS.

## Mantenimiento periódico

[production-maintenance.sh](../scripts/production-maintenance.sh) permite `monitor`, `backup` y `scheduled-backup`. Comprueba la release activa, la identidad de la API y su activación. `backup` ejecuta respaldo y restauración aislada; `scheduled-backup` hace un intento diario durante las 01:00–01:59 de `America/Caracas`, independientemente de la zona horaria del host. No reintenta indefinidamente ese mismo día: revisar el estado y ejecutar el respaldo manual tras resolver un fallo.

El cron propio /etc/cron.d/manzanas-maracay-production fue instalado y verificado el 5 de noviembre de 2026 a las 12:05:58.497181 UTC, con los bytes exactos de [production-maintenance.cron.example](../infra/production-maintenance.cron.example). Antes de instalar se comprobaron identidad, fuente, activación, respaldo/restauración y monitor. No cambió otros cron ni reinició servicios. Monitor cada cinco minutos y un intento diario de respaldo con restauración entre 01:00 y 01:59 de America/Caracas. La ejecución manual inicial pasó; no se atribuye ese resultado a una futura ejecución diaria.

El monitor considera vencida la última restauración verificada después de 36 horas. Escribe estados y logs privados; no envía alertas externas ni automatiza la copia cifrada fuera del VPS. Tampoco elimina copias automáticamente: revisar espacio y acordar retención antes de retirar archivos.

## Recuperación de una incidencia

1. Cerrar temporalmente las mutaciones mediante el control de activación y preservar la base, volumen, release, logs y respaldos existentes. No restaurar encima de la base activa ni borrar staging.
2. Identificar el último respaldo verificado y su estado comercial; reconocer que las operaciones posteriores a su fecha no están incluidas. Recuperar la copia externa si el VPS no está disponible.
3. Descifrar y ensayar la restauración aislada completa, incluidas ACL y conciliación de stock, costos y saldos. Si una verificación falla, no habilitar operaciones ni cambiar permisos para hacerla pasar.
4. Preparar una nueva instancia exclusiva de recuperación con los roles y secretos correspondientes. El helper de ensayo elimina sus recursos al terminar: no promueve automáticamente esa base a producción.
5. Comparar la información recuperada con los comprobantes y operaciones posteriores. Preparar la activación vinculada a la release, origen y UUID recuperados; aprobar de forma concreta cualquier cambio de tráfico compartido. Verificar acceso, permisos y otras aplicaciones antes y después.

La restauración aislada desde la copia externa sí se ejecutó y está verificada. Esto no equivale a recuperar todo el VPS después de una pérdida real, ni acredita recuperación tras perder el PC/perfil DPAPI. El tiempo de recuperación y la pérdida máxima de datos aún requieren una política de copia externa mantenida y el ensayo de esos escenarios adicionales.
