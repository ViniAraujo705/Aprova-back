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
import { ProductivityReportService } from './productivity-report.service';

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
  constructor(
    private readonly ratingsReport: RatingsReportService,
    private readonly productivityReport: ProductivityReportService,
  ) {}

  @Get('productivity')
  @ApiOperation({
    summary:
      'Relatorio de produtividade: enviados, aprovados, nota, versoes, tempo ate aprovar, prazos, serie mensal, clientes, equipe e o que esta em aberto agora. Periodo opcional (de inclusivo, ate exclusivo).',
  })
  @ApiQuery({ name: 'de', required: false, description: 'ISO 8601' })
  @ApiQuery({ name: 'ate', required: false, description: 'ISO 8601' })
  productivity(
    @CurrentUser() user: AuthUser,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    const inicio = parseDate(de, 'de') ?? null;
    const fim = parseDate(ate, 'ate') ?? null;
    if (inicio && fim && inicio >= fim) {
      throw new BadRequestException('de precisa ser antes de ate');
    }
    return this.productivityReport.build(user.accountId, {
      de: inicio,
      ate: fim,
    });
  }

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
