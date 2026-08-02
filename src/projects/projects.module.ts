import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ReportsModule } from '../reports/reports.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [ReportsModule, PlansModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
