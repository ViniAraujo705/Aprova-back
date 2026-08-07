import { Module } from '@nestjs/common';
import { PortfolioProfileService } from './portfolio-profile.service';
import { PortfolioProfileController } from './portfolio-profile.controller';

@Module({
  controllers: [PortfolioProfileController],
  providers: [PortfolioProfileService],
})
export class PortfolioProfileModule {}
