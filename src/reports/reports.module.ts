import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { ProjectReportService } from './project-report.service';
import { RatingsReportService } from './ratings-report.service';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [PdfService, ProjectReportService, RatingsReportService],
  exports: [ProjectReportService],
})
export class ReportsModule {}
