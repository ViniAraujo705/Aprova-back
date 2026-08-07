import { Module } from '@nestjs/common';
import { PortfolioCategoriesService } from './portfolio-categories.service';
import { PortfolioCategoriesController } from './portfolio-categories.controller';

@Module({
  controllers: [PortfolioCategoriesController],
  providers: [PortfolioCategoriesService],
})
export class PortfolioCategoriesModule {}
