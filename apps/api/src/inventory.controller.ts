import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import type { AuthenticatedRequest } from './auth/auth.guard';

@Controller('api')
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}
  @Get('suppliers') suppliers() {
    return this.inventory.suppliers();
  }
  @Post('suppliers') createSupplier(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.saveSupplier(body, key, req.user!.id);
  }
  @Patch('suppliers/:id') updateSupplier(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.saveSupplier(body, key, req.user!.id, id);
  }
  @Get('inventory') overview(@Query() query: unknown) {
    return this.inventory.overview(query);
  }
  @Get('inventory/sale-availability') saleAvailability() {
    return this.inventory.saleAvailability();
  }
  @Get('inventory/lots/:id') detail(@Param('id') id: string) {
    return this.inventory.detail(id);
  }
  @Post('receipts') receive(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.receive(body, key, req.user!.id);
  }
  @Post('inventory/lots/:id/:operation') operate(
    @Param('id') id: string,
    @Param('operation') operation: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.operate(id, operation, body, key, req.user!.id);
  }
  @Post('inventory/movements/:id/reverse') reverse(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventory.reverse(id, body, key, req.user!.id);
  }
}
