import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlansModule } from '../plans/plans.module';
import { VideosModule } from '../videos/videos.module';
import { BillingModule } from '../billing/billing.module';
import { AdminDashboardService } from './admin-dashboard.service';

@Module({
  imports: [PlansModule, VideosModule, BillingModule],
  controllers: [AdminController],
  providers: [AdminService, AdminDashboardService],
})
export class AdminModule {}
