import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { TeamService } from './team.service';
import { PlansService } from '../plans/plans.service';
import { PerformanceQueryDto } from './dto/performance-query.dto';

@ApiTags('team')
@ApiBearerAuth()
@Controller('team')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.owner)
export class TeamController {
  constructor(
    private readonly teamService: TeamService,
    private readonly plansService: PlansService,
  ) {}

  @Get('performance')
  @ApiOperation({
    summary:
      'Desempenho por pessoa da equipe: nota media (0-10), aprovados, versoes ate aprovar, entregas no prazo e trabalho em aberto. Periodo opcional (de/ate, pela data de aprovacao). Requer plano Agencia.',
  })
  async getPerformance(
    @CurrentUser() user: AuthUser,
    @Query() query: PerformanceQueryDto,
  ) {
    await this.plansService.assertFeature(user.accountId, 'teamPerformance');
    const de = query.de ? new Date(query.de) : null;
    const ate = query.ate ? new Date(query.ate) : null;
    if (de && ate && de >= ate) {
      throw new BadRequestException('de precisa ser antes de ate');
    }
    return this.teamService.getPerformance(user.accountId, { de, ate });
  }
}
