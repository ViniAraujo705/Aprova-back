import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Headers,
  Post,
  Query,
  Req,
  RawBodyRequest,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
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
   * Chamado pela AbacatePay (sem autenticacao JWT — a autenticidade vem da
   * verificacao de assinatura HMAC + secret na query string, dentro do
   * service). Precisa do corpo bruto (ver rawBody: true em main.ts).
   */
  @Post('webhooks/abacatepay')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Query('webhookSecret') webhookSecret: string | undefined,
  ) {
    await this.billingService.processWebhook(
      req.rawBody,
      signature,
      webhookSecret,
    );
    return { received: true };
  }
}
