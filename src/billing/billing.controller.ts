import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  createCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(
      user.accountId,
      dto.plan,
      dto.cycle,
      dto.cpfCnpj,
    );
  }

  @Post('cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.owner)
  cancel(@CurrentUser() user: AuthUser) {
    return this.billingService.cancel(user.accountId);
  }

  /**
   * Chamado pela Asaas (sem autenticacao JWT — autenticidade vem do token
   * configurado ao registrar o webhook no painel Asaas, ecoado de volta no
   * header asaas-access-token). O payload ja vem completo, diferente do
   * payload magro da Mercado Pago.
   */
  @Post('webhooks/asaas')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Headers('asaas-access-token') token: string | undefined,
    @Body()
    body: {
      event?: string;
      payment?: { subscription?: string; externalReference?: string };
    },
  ) {
    await this.billingService.processWebhook(token, body?.event, body?.payment);
    return { received: true };
  }
}
