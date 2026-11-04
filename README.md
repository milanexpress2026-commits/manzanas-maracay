# Manzanas Maracay

Aplicación para una distribuidora venezolana de frutas importadas. La **fase 2** añade proveedores, recepción por lotes, inventario transaccional y acceso por sesión al catálogo existente. Usa PostgreSQL real; no incluye facturación, cobranza ni una tasa BCV en vivo.

Repositorio público por autorización del propietario: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama de trabajo: `phase-2/inventario-staging`, basada en `phase-1/foundations`. [Contexto para continuar la revisión en otro chat](docs/continuar-en-chatgpt.md).

La visibilidad del código no da acceso a la aplicación ni a sus datos. La URL de staging confirmada es [manzanas.ganamosclub.net](https://manzanas.ganamosclub.net): su publicación, DNS, proxy y HTTPS están pendientes de verificación al redactar este documento. No es una entrega de producción. El estado de infraestructura se registra en [docs/infrastructure.md](docs/infrastructure.md).

## Abrir en esta computadora

1. Abre una terminal en esta carpeta.
2. Ejecuta `npm run dev`.
3. Abre **http://127.0.0.1:3100** e inicia sesión con los datos privados de `.local/auth-local.json`.

El iniciador crea la configuración local si falta, inicia PostgreSQL exclusivo del proyecto, aplica migraciones, prepara el catálogo inicial y un usuario local con contraseña aleatoria, y enciende API e interfaz. No instala servicios de Windows. `Ctrl+C` detiene los procesos; los datos permanecen en `.local/postgres`. El archivo de acceso no se imprime en consola y está excluido de Git.

También puedes abrir `INICIAR.ps1` desde PowerShell. No cambies la política de ejecución global si Windows lo bloquea: utiliza `npm run dev` en la terminal.

## Instalación en otra computadora

Requiere Node.js 24.x, npm y aproximadamente 2 GB para dependencias, compilación y base local; las pruebas de navegador consumen espacio adicional.

```powershell
npm ci
npm run dev
```

Las contraseñas de base y la clave interna se generan aleatoriamente y se guardan en `.env`, excluido de Git. El acceso de la persona está separado en `.local/auth-local.json`. No son credenciales del VPS. No compartas `.env`, `.local`, archivos de invitación ni respaldos junto con el código.

## Qué puedes hacer

- **Catálogo (`/`)**: crear frutas, variedades y calibres; crear y editar empaques de 1 a 100 blíster por caja.
- **Proveedores (`/proveedores`)**: crear, editar y desactivar proveedores sin borrar su historia.
- **Recepciones (`/recepciones`)**: registrar varias líneas de cajas cerradas con proveedor, referencia, fecha, costo USD y empaque propio por lote.
- **Inventario (`/inventario`)**: filtrar y consultar lotes, cantidades y movimientos; abrir cajas y blíster, retirar blíster, preparar medias cajas con conteo, ajustar con motivo y revertir el último movimiento admisible.
- Conservar los registros al reiniciar, registrar el usuario que opera y evitar duplicados cuando se reintenta la misma solicitud.

Los ejemplos iniciales son Manzana, Pera, Gala, Pink Lady y los calibres 80 y 180. Solo Gala tiene empaques iniciales: 5 y 4 blíster respectivamente. **No son existencias.** La migración crea `Almacén principal`, sin proveedores ni stock. Las recepciones en staging y pruebas se marcan DEMO desde el servidor y viven en bases separadas de los datos locales.

El calibre nunca determina cuánta fruta hay. Una caja abierta y su contenido no se suman dos veces. Las piezas de un empaque intacto permanecen desconocidas hasta contarlas; preparar 18 de 37 deja 19. Un retiro de inventario no genera una venta ni una deuda. Consulta el [modelo de inventario](docs/inventory-model.md).

## Acceso y sesiones

El catálogo y los módulos operativos requieren sesión. Las contraseñas se almacenan con scrypt; las sesiones son revocables, caducan a las 8 horas y tras 30 minutos de inactividad. El navegador recibe una cookie `HttpOnly` y `SameSite=Strict`; staging exige HTTPS y cookie `Secure`. Cerrar sesión la revoca en el servidor.

No hay registro público, recuperación por correo ni niveles de permisos en esta fase. El operador prepara usuarios invitados mediante `npx tsx scripts/create-user.ts --file <archivo-privado>` después de configurar la base y el directorio privado autorizado. El archivo contiene `username`, `displayName` y `password`; no se pasa la contraseña como argumento. `--reset` reemplaza un acceso existente e invalida sus sesiones. Staging no crea usuarios automáticamente.

## Organización

```text
apps/web/                 Next.js, interfaz responsive y proxy del mismo origen
apps/api/                 NestJS, autenticación, catálogo e inventario
packages/domain/          Reglas puras, validaciones y tipos compartidos
packages/database/        Esquema Drizzle y migraciones PostgreSQL
scripts/                  Arranque, migración, usuarios, pruebas y operación de staging
tests/unit/               Reglas de inventario, empaques, precios y BCV
tests/e2e/                Navegador, API e integridad de PostgreSQL
infra/                    Preparación de infraestructura aislada del proyecto
.agents/skills/           Cuatro Skills revisadas e instaladas localmente
docs/                     Arquitectura, reglas, revisión y capturas
```

## Verificación

`npm run typecheck` genera primero los tipos de rutas de Next.js. Puede ejecutarse después de `npm ci` en un clon nuevo, sin iniciar la aplicación ni compilarla antes. El archivo generado `apps/web/next-env.d.ts` y la carpeta `.next` no se versionan.

```powershell
npm run typecheck
npm test
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.local/browsers"
npx playwright install chromium
npm run test:e2e
```

Cierra `npm run dev` antes de las pruebas de extremo a extremo: ambas usan el puerto local 55432, pero las pruebas escriben únicamente en `manzanas_maracay_test`. `npm run test:e2e` inicia y cierra sus propios servicios. Nunca apunta al VPS. Si cerraste una terminal por fuerza, `npm run db:stop` detiene solo la base identificada por el directorio de este proyecto. No uses comandos globales para matar procesos.

El esquema evoluciona con `npm run db:generate` y `npm run db:migrate`. No uses `drizzle-kit push` ni reescribas migraciones aplicadas. Hay seis migraciones, de `0000` a `0005`; las últimas añaden inventario operativo, sesiones y cierre de escritura del historial. El migrador admite únicamente las bases locales del proyecto o su base de staging aislada con configuración explícita. Las pruebas nunca usan staging.

La fase 1 conserva sus resultados históricos en su entrega. La verificación final de fase 2 está en curso; no se deduce un resultado aprobado de la mera existencia de tests.

## Docker como alternativa de desarrollo

Se incluye `compose.yaml`, con nombre de proyecto, volumen propio, límite de recursos y publicación exclusivamente en `127.0.0.1:55432`. **No se ejecutó Docker en esta computadora**, porque no está instalado. No lo arranques a la vez que PostgreSQL portable.

Después de generar `.env` con el iniciador y detenerlo, una máquina con Docker puede usar `docker compose up -d postgres` y `node scripts/dev.mjs --external-db`. El rol de aplicación se crea al inicializar un volumen nuevo; las migraciones conceden sus permisos mínimos. La creación automática de la base de pruebas corresponde al iniciador portable; el flujo Docker se entrega para desarrollo y requiere validación antes de adoptarlo.

## Documentación

- [Entrega de la fase 1](docs/entrega-fase-1.md)
- [Plan autorizado de fase 2](docs/plan-fase-2.md)
- [Revisión del punto de partida](docs/revision-fase-1.md)
- [Inventario operativo y garantías](docs/inventory-model.md)
- [Reglas permanentes del negocio](docs/domain-rules.md)
- [Arquitectura y modelo de datos](docs/architecture.md)
- [Inspección de infraestructura](docs/infrastructure.md)
- [Skills y revisión de procedencia](docs/skills.md)
- [Revisión visual y accesibilidad](docs/visual-review.md)
- [Descripción preparada para el PR](docs/pull-request.md)
- [Continuar la revisión en otro chat](docs/continuar-en-chatgpt.md)
- [Logo oficial y activos de marca](docs/brand-assets.md)

El logo oficial del propietario se conserva en `apps/web/public/brand/logo-manzanas-maracay.png` y se usa como fuente de las versiones para interfaz e instalación. La PWA ofrece instalación y una página sin conexión; no guarda datos operativos en caché ni registra operaciones comerciales sin conexión. Las tablas comerciales futuras no habilitan ventas, cobranza, WhatsApp ni BCV. La publicación de staging requiere completar la verificación de aislamiento, HTTPS, acceso y respaldo.
