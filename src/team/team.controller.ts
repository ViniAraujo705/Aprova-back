import { Controller, Get, UseGuards } from '@nestjs/common';
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
      'Desempenho por editor: nota media (0-10) dos videos aprovados atribuidos e contagem de aprovados. Requer plano Agencia.',
  })
  async getPerformance(@CurrentUser() user: AuthUser) {
    await this.plansService.assertFeature(user.accountId, 'teamPerformance');
    return this.teamService.getPerformance(user.accountId);
  }
}
