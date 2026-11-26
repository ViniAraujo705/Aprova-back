import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStorageService } from './admin-storage.service';
import { PlansService } from '../plans/plans.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateAccountPlanDto } from './dto/update-account-plan.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly plansService: PlansService,
    private readonly dashboardService: AdminDashboardService,
    private readonly storageService: AdminStorageService,
  ) {}

  @Get('storage')
  @ApiOperation({
    summary:
      'Armazenamento real do R2: total, custo estimado, por tipo de arquivo, por conta e arquivos nao vinculados (cache 10 min; ?atualizar=1 recalcula).',
  })
  getStorage(@Query('atualizar') atualizar?: string) {
    return this.storageService.getReport(
      atualizar === '1' || atualizar === 'true',
    );
  }

  @Get('people')
  @ApiOperation({
    summary:
      'Todas as pessoas com login (donos, editores, admins) com agencias, papel, login e ultimo acesso.',
  })
  listPeople() {
    return this.adminService.listPeople();
  }

  @Get('dashboard')
  @ApiOperation({
    summary:
      'Painel do super admin: inscricoes, contas, receita (MRR) e inadimplencia (banco + Asaas).',
  })
  getDashboard() {
    return this.dashboardService.getDashboard();
  }

  @Get('users')
  listUsers() {
    return this.adminService.listProfessionals();
  }

  @Patch('users/:id/status')
  setUserStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.setUserStatus(id, dto.status);
  }

  @Get('metrics')
  getMetrics() {
    return this.adminService.getMetrics();
  }

  /**
   * Troca o plano de uma conta manualmente. Fallback do fluxo real de
   * assinatura (ver src/billing) — util pra cortesias, testes ou correcao
   * manual se um webhook falhar.
   */
  @Patch('accounts/:id/plan')
  setAccountPlan(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAccountPlanDto,
  ) {
    return this.plansService.setPlan(id, dto.plan);
  }

  @Get('videos/errors')
  listErrorVideos() {
    return this.adminService.listErrorVideos();
  }

  @Post('videos/:id/reprocess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reenfileira thumbnail + versao otimizada de qualquer video, inclusive um ja pronto, sem exigir novo upload.',
  })
  reprocessVideo(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.adminService.reprocessVideo(id);
  }
}
