import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { AuthService } from './auth.service';
import { authConfig, sessionToken } from './config';
import type { SessionUser } from '../../../../packages/domain/src/auth';

export const PublicHealth = () => SetMetadata('mm-public-health', true);
export const SessionOptional = () => SetMetadata('mm-session-optional', true);
export type AuthenticatedRequest = {
  user: SessionUser;
  headers: Record<string, string | undefined>;
  method: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride('mm-public-health', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actual = request.headers['x-mm-internal'];
    const expected = process.env.MM_INTERNAL_TOKEN;
    if (
      !expected ||
      typeof actual !== 'string' ||
      Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    )
      throw new UnauthorizedException('Accede desde la aplicación.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const config = authConfig();
      const allowed = new Set([config.origin]);
      if (['local', 'test'].includes(config.environment)) {
        const port = new URL(config.origin).port;
        allowed.add(`http://127.0.0.1:${port}`);
        allowed.add(`http://localhost:${port}`);
      }
      if (typeof request.headers.origin !== 'string' || !allowed.has(request.headers.origin))
        throw new ForbiddenException('La solicitud no viene de esta aplicación.');
    }
    if (
      this.reflector.getAllAndOverride('mm-session-optional', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    request.user = await this.auth.authenticate(sessionToken(request.headers.cookie));
    return true;
  }
}
