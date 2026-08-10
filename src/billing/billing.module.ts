import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { AsaasService } from './asaas/asaas.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, AsaasService],
})
export class BillingModule {}
