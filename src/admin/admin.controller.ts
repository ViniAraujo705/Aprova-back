import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { PlansService } from '../plans/plans.service';
import { BillingProductsService } from '../billing/billing-products.service';
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
    private readonly billingProductsService: BillingProductsService,
  ) {}

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

  /**
   * Cria na AbacatePay os produtos (Pro/Agencia x mensal/anual) que ainda
   * nao existirem, casando por externalId. Idempotente — rodar de novo nao
   * duplica nada. Precisa rodar antes do primeiro checkout funcionar.
   */
  @Post('billing/sync-products')
  syncBillingProducts() {
    return this.billingProductsService.ensureProducts();
  }

  @Get('videos/errors')
  listErrorVideos() {
    return this.adminService.listErrorVideos();
  }
}
