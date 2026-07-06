import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
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
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner, UserRole.editor)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('insights')
  @ApiOperation({
    summary:
      'Insights do painel: vídeos parados, clientes por tempo de aprovação e aprovados no mês (escopados ao usuário).',
  })
  @ApiQuery({
    name: 'horas_pendentes',
    required: false,
    type: Number,
    description:
      'Janela em horas para considerar um vídeo pendente como "atrasado" (padrão 48).',
  })
  getInsights(
    @CurrentUser() user: AuthUser,
    @Query('horas_pendentes', new DefaultValuePipe(48), ParseIntPipe)
    horasPendentes: number,
  ) {
    return this.dashboardService.getInsights(user.accountId, horasPendentes);
  }
}
