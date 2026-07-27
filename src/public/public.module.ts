import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PublicProjectsController } from './public-projects.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [PublicController, PublicProjectsController],
  providers: [PublicService],
})
export class PublicModule {}
