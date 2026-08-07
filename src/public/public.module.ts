import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PublicProjectsController } from './public-projects.controller';
import { PublicPortfoliosController } from './public-portfolios.controller';
import { PublicPortfolioHubController } from './public-portfolio-hub.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    PublicController,
    PublicProjectsController,
    PublicPortfoliosController,
    PublicPortfolioHubController,
  ],
  providers: [PublicService],
})
export class PublicModule {}
