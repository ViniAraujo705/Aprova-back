import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { ProjectReportService } from './project-report.service';

@Module({
  providers: [PdfService, ProjectReportService],
  exports: [ProjectReportService],
})
export class ReportsModule {}
