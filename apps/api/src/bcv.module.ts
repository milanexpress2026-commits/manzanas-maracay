import { Module } from '@nestjs/common';
import { BcvController } from './bcv.controller';
import { BcvService } from './bcv.service';

@Module({ controllers: [BcvController], providers: [BcvService], exports: [BcvService] })
export class BcvModule {}
