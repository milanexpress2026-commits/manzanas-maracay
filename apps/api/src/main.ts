import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Headers,
  Body,
  Inject,
  Req,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { CatalogService } from './catalog.service';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuthModule } from './auth/auth.module';
import { PublicHealth, type AuthenticatedRequest } from './auth/auth.guard';
import { authConfig } from './auth/config';
import { InventoryModule } from './inventory.module';
import { CommerceModule } from './commerce.module';
import { PushModule } from './push.module';
@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500,
      message = 'No se pudo completar la operación. Inténtalo nuevamente.';
    if (error instanceof HttpException) {
      status = error.getStatus();
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 400;
      message = error.issues.map((issue) => issue.message).join(' ');
    } else {
      const e = error as { code?: string; cause?: { code?: string }; type?: string };
      const code = e.code ?? e.cause?.code;
      if (code === '23505') {
        status = 409;
        message = 'Este registro ya existe. Revisa la lista antes de crear otro.';
      }
      if (code === '23503') {
        status = 400;
        message =
          'La fruta, variedad o calibre seleccionados no corresponden. Actualiza el catálogo.';
      }
      if (code === '23514') {
        status = 400;
        message = 'Revisa las cantidades y los campos del formulario.';
      }
      if (['ECONNREFUSED', '57P01', '08006'].includes(code ?? '')) {
        status = 503;
        message = 'La base de datos no está disponible. Tus cambios no se guardaron.';
      }
      if (e.type === 'entity.too.large') {
        status = 413;
        message = 'El formulario es demasiado grande.';
      }
      if (e.type === 'entity.parse.failed') {
        status = 400;
        message = 'Formato JSON inválido.';
      }
      if (status === 500) console.error('API operation failed', code ?? 'unknown');
    }
    host.switchToHttp().getResponse().status(status).json({ message, statusCode: status });
  }
}
@Controller('api')
class HealthController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get('health') @PublicHealth() async health() {
    try {
      return await this.catalog.health();
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible.');
    }
  }
}
@Controller('api/catalog')
class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get() read() {
    return this.catalog.read();
  }
  @Post('fruits') fruit(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('fruits', body, key, undefined, request.user.id);
  }
  @Post('varieties') variety(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('varieties', body, key, undefined, request.user.id);
  }
  @Post('calibers') caliber(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('calibers', body, key, undefined, request.user.id);
  }
  @Patch('varieties/:id') renameVariety(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('update-variety', body, key, id, request.user.id);
  }
  @Post('configurations') configuration(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('configurations', body, key, undefined, request.user.id);
  }
  @Patch('configurations/:id') update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('update-packing', body, key, id, request.user.id);
  }
}
@Module({
  controllers: [HealthController, CatalogController],
  providers: [CatalogService],
})
class CatalogModule {}
@Module({ imports: [AuthModule, CatalogModule, InventoryModule, CommerceModule, PushModule] })
class AppModule {}
async function main() {
  if (!process.env.DATABASE_URL || !process.env.MM_INTERNAL_TOKEN)
    throw new Error('Inicia con npm run dev para cargar la configuración local.');
  authConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['warn', 'error'],
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.MM_API_PORT ?? 3101), process.env.MM_API_HOST ?? '127.0.0.1');
  console.log('API de Manzanas Maracay lista.');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
