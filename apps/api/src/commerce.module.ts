import { Module } from '@nestjs/common';
import { InventoryModule } from './inventory.module';
import { BcvModule } from './bcv.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';

@Module({
  imports: [InventoryModule, BcvModule],
  controllers: [CommerceController],
  providers: [CommerceService],
  exports: [CommerceService],
})
export class CommerceModule {}
