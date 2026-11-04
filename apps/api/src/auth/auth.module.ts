import { Body, Controller, Get, Global, Inject, Module, Post, Req, Res } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard, SessionOptional, type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { sessionCookie, sessionToken } from './config';

type CookieResponse = { setHeader(name: string, value: string): void };
@Controller('api/auth')
class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('login')
  @SessionOptional()
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const result = await this.auth.login(body, sessionToken(request.headers.cookie));
    response.setHeader('Set-Cookie', sessionCookie(result.token));
    response.setHeader('Cache-Control', 'no-store');
    return result.info;
  }
  @Get('me') me(@Req() request: AuthenticatedRequest) {
    return this.auth.info(request.user);
  }
  @Post('logout')
  @SessionOptional()
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    await this.auth.logout(sessionToken(request.headers.cookie));
    response.setHeader('Set-Cookie', sessionCookie('', true));
    response.setHeader('Cache-Control', 'no-store');
    return { ok: true };
  }
}
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService],
})
export class AuthModule {}
