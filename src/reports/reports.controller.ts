import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RatingsReportService } from './ratings-report.service';

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${name} invalido`);
  }
  return date;
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner)
export class ReportsController {
  constructor(private readonly ratingsReport: RatingsReportService) {}

  @Get('ratings')
  @ApiOperation({
    summary:
      'Historico de notas dos clientes (inclui videos/projetos ja excluidos).',
  })
  @ApiQuery({ name: 'de', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'ate', required: false, description: 'ISO 8601' })
  ratings(
    @CurrentUser() user: AuthUser,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    return this.ratingsReport.list(
      user.accountId,
      parseDate(de, 'de'),
      parseDate(ate, 'ate'),
    );
  }
}
