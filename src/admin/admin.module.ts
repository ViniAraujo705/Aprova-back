import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlansModule } from '../plans/plans.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PlansModule, BillingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
