import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PlansModule } from '../plans/plans.module';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [PlansModule, VideosModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
