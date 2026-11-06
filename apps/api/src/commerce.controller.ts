import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth/auth.guard';
import { CommerceService } from './commerce.service';
import { salePdf, paymentPdf } from './commerce-pdf';

@Controller('api')
export class CommerceController {
  constructor(@Inject(CommerceService) private readonly commerce: CommerceService) {}
  @Get('clients') clients(@Query() query: unknown) {
    return this.commerce.clients(query);
  }
  @Post('clients') createClient(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.saveClient(body, key, request.user.id);
  }
  @Patch('clients/:id') updateClient(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.saveClient(body, key, request.user.id, id);
  }
  @Get('clients/:id') account(@Param('id') id: string) {
    return this.commerce.account(id);
  }
  @Get('prices') prices() {
    return this.commerce.prices();
  }
  @Post('prices') updatePrices(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.savePrices(body, key, request.user.id);
  }
  @Get('sales') sales(@Query() query: unknown) {
    return this.commerce.sales(query);
  }
  @Post('sales') createSale(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.createSale(body, key, request.user.id);
  }
  @Get('sales/:id') sale(@Param('id') id: string) {
    return this.commerce.sale(id);
  }
  @Post('sales/:id/dates') dates(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.changeDates(id, body, key, request.user.id);
  }
  @Post('sales/:id/cancel') cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.cancelSale(id, body, key, request.user.id);
  }
  @Get('payments') payments(@Query() query: unknown) {
    return this.commerce.payments(query);
  }
  @Post('payments') createPayment(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.createPayment(body, key, request.user.id);
  }
  @Get('payments/:id') payment(@Param('id') id: string) {
    return this.commerce.payment(id);
  }
  @Post('payments/:id/reverse') reversePayment(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commerce.reversePayment(id, body, key, request.user.id);
  }
  @Get('collections') collections() {
    return this.commerce.collections();
  }
  @Get('sales/:id/document')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async saleDocument(@Param('id') id: string) {
    const sale = await this.commerce.sale(id);
    return new StreamableFile(await salePdf(sale), {
      type: 'application/pdf',
      disposition: `attachment; filename="venta-${sale.id}.pdf"`,
    });
  }
  @Get('payments/:id/document')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async paymentDocument(@Param('id') id: string) {
    const payment = await this.commerce.payment(id);
    return new StreamableFile(await paymentPdf(payment), {
      type: 'application/pdf',
      disposition: `attachment; filename="abono-${payment.id}.pdf"`,
    });
  }
  @Get('sales/:id/delivery-note')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async deliveryDocument(@Param('id') id: string) {
    const sale = await this.commerce.sale(id);
    return new StreamableFile(await salePdf(sale, 'delivery'), {
      type: 'application/pdf',
      disposition: `inline; filename="entrega-${sale.id}.pdf"`,
    });
  }
}
