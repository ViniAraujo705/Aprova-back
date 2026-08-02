import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingProductsService } from './billing-products.service';
import { AbacatePayService } from './abacatepay/abacatepay.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, BillingProductsService, AbacatePayService],
  exports: [BillingProductsService],
})
export class BillingModule {}
