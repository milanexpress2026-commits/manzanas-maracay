import { Body, Controller, Get, Headers, Inject, Post, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth/auth.guard';
import { PushService } from './push.service';

@Controller('api/push')
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}
  @Get('status') status() {
    return this.push.status();
  }
  @Post('subscribe') subscribe(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.push.subscribe(body, key, req.user.id);
  }
  @Post('unsubscribe') unsubscribe(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.push.unsubscribe(body, key, req.user.id);
  }
}
