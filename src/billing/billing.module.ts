import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, MercadoPagoService],
})
export class BillingModule {}
