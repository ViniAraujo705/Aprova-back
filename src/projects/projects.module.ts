import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ReportsModule } from '../reports/reports.module';
import { PlansModule } from '../plans/plans.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [ReportsModule, PlansModule, GoogleDriveModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
