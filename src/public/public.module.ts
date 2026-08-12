import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientActivityModule } from '../client-activity/client-activity.module';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PublicProjectsController } from './public-projects.controller';
import { PublicPortfoliosController } from './public-portfolios.controller';
import { PublicPortfolioHubController } from './public-portfolio-hub.controller';

@Module({
  imports: [NotificationsModule, ClientActivityModule],
  controllers: [
    PublicController,
    PublicProjectsController,
    PublicPortfoliosController,
    PublicPortfolioHubController,
  ],
  providers: [PublicService],
})
export class PublicModule {}
