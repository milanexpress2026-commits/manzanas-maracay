import { Controller, Get, Inject } from '@nestjs/common';
import { BcvService } from './bcv.service';

/** Deliberately private: the global session guard remains in force. */
@Controller('api/rates')
export class BcvController {
  constructor(@Inject(BcvService) private readonly bcv: BcvService) {}

  @Get('current')
  current() {
    return this.bcv.status();
  }
}
