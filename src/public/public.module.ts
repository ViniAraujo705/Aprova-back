import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PublicProjectsController } from './public-projects.controller';

@Module({
  controllers: [PublicController, PublicProjectsController],
  providers: [PublicService],
})
export class PublicModule {}
