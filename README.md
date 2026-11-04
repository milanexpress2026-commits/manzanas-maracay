# Manzanas Maracay

Aplicación comercial para una distribuidora venezolana de frutas importadas. Esta entrega cubre la **fase 1: fundamentos y catálogo**, con datos reales en PostgreSQL local. No incluye facturación, cobranza ni despliegue público.

Repositorio privado autorizado: [milanexpress2026-commits/manzanas-maracay](https://github.com/milanexpress2026-commits/manzanas-maracay). Rama de trabajo: `phase-1/foundations`. [Contexto para continuar la revisión en otro chat](docs/continuar-en-chatgpt.md).

## Abrir en esta computadora

1. Abre una terminal en esta carpeta.
2. Ejecuta `npm run dev`.
3. Abre **http://127.0.0.1:3100**.

El iniciador crea la configuración local si falta, inicia PostgreSQL exclusivo del proyecto, aplica migraciones, carga los ejemplos iniciales solo si el catálogo está vacío y enciende la API y la interfaz. No instala servicios de Windows. La primera ejecución puede tardar un poco más. `Ctrl+C` detiene los procesos; los datos permanecen en `.local/postgres`.

También puedes abrir `INICIAR.ps1` desde PowerShell. No cambies la política de ejecución global si Windows lo bloquea: utiliza `npm run dev` en la terminal.

## Instalación en otra computadora

Requiere Node.js 24.x, npm y aproximadamente 2 GB para dependencias, compilación y base local; las pruebas de navegador consumen espacio adicional.

```powershell
npm ci
npm run dev
```

La contraseña de desarrollo y la clave interna se generan aleatoriamente y se guardan en `.env`, excluido de Git. No son credenciales del VPS. No compartas `.env` ni `.local` junto con el código.

## Qué puedes hacer

- Crear y consultar frutas, variedades y calibres.
- Combinar variedad y calibre de una misma fruta en un empaque.
- Definir y modificar entre 1 y 100 blíster por caja, con notas.
- Buscar, filtrar y consultar el detalle visual del empaque.
- Volver a abrir la aplicación y conservar los registros.

Los ejemplos iniciales son Manzana, Pera, Gala, Pink Lady y los calibres 80 y 180. Solo Gala tiene empaques iniciales: 5 y 4 blíster respectivamente. **No son existencias.** No se cargan ventas, saldos, proveedores ficticios ni tasas de cambio.

## Organización

```text
apps/web/                 Next.js, interfaz responsive y proxy local
apps/api/                 NestJS, catálogo y validación de solicitudes
packages/domain/          Reglas puras, validaciones y tipos compartidos
packages/database/        Esquema Drizzle y migraciones PostgreSQL
scripts/                  Arranque, migración, semillas y pruebas locales
tests/unit/               Reglas de inventario, empaques, precios y BCV
tests/e2e/                Navegador, API e integridad de PostgreSQL
infra/                    Preparación del rol de base en Docker
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

El esquema evoluciona con `npm run db:generate` y `npm run db:migrate`. No uses `drizzle-kit push`. Los comandos de migración rechazan destinos remotos o nombres de base ajenos.

## Docker como alternativa de desarrollo

Se incluye `compose.yaml`, con nombre de proyecto, volumen propio, límite de recursos y publicación exclusivamente en `127.0.0.1:55432`. **No se ejecutó Docker en esta computadora**, porque no está instalado. No lo arranques a la vez que PostgreSQL portable.

Después de generar `.env` con el iniciador y detenerlo, una máquina con Docker puede usar `docker compose up -d postgres` y `node scripts/dev.mjs --external-db`. El rol de aplicación se crea al inicializar un volumen nuevo; las migraciones conceden sus permisos mínimos. La creación automática de la base de pruebas corresponde al iniciador portable; el flujo Docker se entrega para desarrollo y requiere validación antes de adoptarlo.

## Documentación

- [Entrega de la fase 1](docs/entrega-fase-1.md)
- [Reglas permanentes del negocio](docs/domain-rules.md)
- [Arquitectura y modelo de datos](docs/architecture.md)
- [Inspección de infraestructura](docs/infrastructure.md)
- [Skills y revisión de procedencia](docs/skills.md)
- [Revisión visual y accesibilidad](docs/visual-review.md)
- [Descripción preparada para el PR](docs/pull-request.md)
- [Continuar la revisión en otro chat](docs/continuar-en-chatgpt.md)
- [Logo oficial y activos de marca](docs/brand-assets.md)

El logo oficial del propietario se conserva en `apps/web/public/brand/logo-manzanas-maracay.png` y se usa como fuente de las versiones para interfaz e instalación. El acceso actual es local y no sustituye una autenticación de producción. La PWA ofrece instalación y una página sin conexión; no guarda operaciones comerciales sin conexión.
