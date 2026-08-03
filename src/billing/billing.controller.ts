import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  Query,
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
   * Chamado pela Mercado Pago (sem autenticacao JWT — autenticidade vem da
   * verificacao de assinatura HMAC via query string + headers, dentro do
   * service). O payload da Mercado Pago e magro (so o id do recurso); o
   * estado real da assinatura e buscado na API dentro do service.
   */
  @Post('webhooks/mercadopago')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Query('data.id') dataId: string | undefined,
    @Query('type') queryType: string | undefined,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    @Body() body: { type?: string; data?: { id?: string } },
  ) {
    await this.billingService.processWebhook(
      dataId ?? body?.data?.id,
      xSignature,
      xRequestId,
      queryType ?? body?.type,
    );
    return { received: true };
  }
}
