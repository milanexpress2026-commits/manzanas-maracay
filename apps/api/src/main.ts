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
  UseGuards,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { CatalogService } from './catalog.service';

@Injectable()
class LocalProxyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const actual = context.switchToHttp().getRequest().headers['x-mm-internal'];
    const expected = process.env.MM_INTERNAL_TOKEN;
    if (
      typeof actual !== 'string' ||
      !expected ||
      actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new UnauthorizedException('Accede desde la aplicación local.');
    return true;
  }
}
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
      const e = error as { code?: string; cause?: { code?: string } };
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
      if (status === 500) console.error('API operation failed', code ?? 'unknown');
    }
    host.switchToHttp().getResponse().status(status).json({ message, statusCode: status });
  }
}
@Controller('api')
class HealthController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get('health') async health() {
    try {
      return await this.catalog.health();
    } catch {
      throw new ServiceUnavailableException('Base de datos no disponible.');
    }
  }
}
@Controller('api/catalog')
@UseGuards(LocalProxyGuard)
class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}
  @Get() read() {
    return this.catalog.read();
  }
  @Post('fruits') fruit(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    return this.catalog.mutate('fruits', body, key);
  }
  @Post('varieties') variety(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    return this.catalog.mutate('varieties', body, key);
  }
  @Post('calibers') caliber(@Body() body: unknown, @Headers('idempotency-key') key?: string) {
    return this.catalog.mutate('calibers', body, key);
  }
  @Post('configurations') configuration(
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('configurations', body, key);
  }
  @Patch('configurations/:id') update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.catalog.mutate('update-packing', body, key, id);
  }
}
@Module({
  controllers: [HealthController, CatalogController],
  providers: [CatalogService, LocalProxyGuard],
})
class CatalogModule {}
@Module({ imports: [CatalogModule] })
class AppModule {}
async function main() {
  if (!process.env.DATABASE_URL || !process.env.MM_INTERNAL_TOKEN)
    throw new Error('Inicia con npm run dev para cargar la configuración local.');
  const app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.MM_API_PORT ?? 3101), '127.0.0.1');
  console.log('API de catálogo lista en loopback.');
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
