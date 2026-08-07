import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PublicProjectsController } from './public-projects.controller';
import { PublicPortfoliosController } from './public-portfolios.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    PublicController,
    PublicProjectsController,
    PublicPortfoliosController,
  ],
  providers: [PublicService],
})
export class PublicModule {}
