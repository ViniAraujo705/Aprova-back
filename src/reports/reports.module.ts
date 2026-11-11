import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { ProjectReportService } from './project-report.service';
import { RatingsReportService } from './ratings-report.service';
import { ProductivityReportService } from './productivity-report.service';
import { ReportsController } from './reports.controller';

@Module({
  controllers: [ReportsController],
  providers: [
    PdfService,
    ProjectReportService,
    RatingsReportService,
    ProductivityReportService,
  ],
  exports: [ProjectReportService],
})
export class ReportsModule {}
