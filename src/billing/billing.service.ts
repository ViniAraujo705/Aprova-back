import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from 'mercadopago';
import { Plan, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoService } from './mercadopago/mercadopago.service';
import {
  PLAN_BILLING,
  BillableCycle,
  BillablePlan,
} from './plan-billing.config';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadopago: MercadoPagoService,
    private readonly config: ConfigService,
  ) {}

  /** Cria a assinatura e devolve a URL (init_point) pra redirecionar o payer. */
  async createCheckout(
    accountId: string,
    plan: BillablePlan,
    cycle: BillableCycle,
  ): Promise<{ url: string }> {
    const owner = await this.getOwner(accountId);
    const def = PLAN_BILLING[plan][cycle];

    const subscription = await this.mercadopago.createPreapproval({
      reason: def.reason,
      payerEmail: owner.email,
      externalReference: this.buildExternalReference(accountId, plan, cycle),
      backUrl: this.buildCompletionUrl(),
      transactionAmount: def.transactionAmount,
      frequency: def.frequency,
      frequencyType: def.frequencyType,
    });

    if (!subscription.init_point) {
      throw new BadRequestException(
        'Mercado Pago nao retornou uma URL de checkout',
      );
    }

    return { url: subscription.init_point };
  }

  /**
   * Cancela a assinatura ativa e ja rebaixa a conta pra free na hora (sem
   * esperar o webhook). O webhook de cancelamento que chegar depois e
   * inofensivo (so confirma o que ja foi feito aqui).
   */
  async cancel(accountId: string): Promise<{ plan: Plan }> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { mercadopagoSubscriptionId: true },
    });
    if (!account.mercadopagoSubscriptionId) {
      throw new BadRequestException(
        'Esta conta nao tem assinatura ativa para cancelar',
      );
    }

    await this.mercadopago.cancelPreapproval(account.mercadopagoSubscriptionId);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { plan: Plan.free },
    });
    return { plan: Plan.free };
  }

  /**
   * Valida a assinatura do webhook e processa a notificacao. O payload da
   * Mercado Pago e magro (so tras o id do recurso) — busca o estado atual
   * da assinatura na API antes de decidir o que fazer.
   */
  async processWebhook(
    dataId: string | undefined,
    xSignature: string | undefined,
    xRequestId: string | undefined,
    type: string | undefined,
  ): Promise<void> {
    this.verifySignature(dataId, xSignature, xRequestId);

    if (type !== 'subscription_preapproval' && type !== 'preapproval') {
      this.logger.log(`Evento de webhook ignorado: ${type}`);
      return;
    }
    if (!dataId) {
      this.logger.warn('Webhook de assinatura sem data.id, ignorando');
      return;
    }

    const subscription = await this.mercadopago.getPreapproval(dataId);
    const parsed = this.parseExternalReference(subscription.external_reference);
    if (!parsed) {
      this.logger.error(
        `Webhook da assinatura ${dataId} sem external_reference reconhecivel`,
      );
      return;
    }

    if (subscription.status === 'authorized') {
      await this.prisma.account.update({
        where: { id: parsed.accountId },
        data: {
          plan: parsed.plan,
          mercadopagoSubscriptionId: dataId,
        },
      });
    } else if (subscription.status === 'cancelled') {
      const account = await this.prisma.account.findUnique({
        where: { id: parsed.accountId },
        select: { plan: true },
      });
      if (account && account.plan !== Plan.free) {
        await this.prisma.account.update({
          where: { id: parsed.accountId },
          data: { plan: Plan.free },
        });
      }
    }
  }

  private verifySignature(
    dataId: string | undefined,
    xSignature: string | undefined,
    xRequestId: string | undefined,
  ): void {
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (!secret) {
      throw new UnauthorizedException(
        'Webhook da Mercado Pago nao configurado (falta MERCADOPAGO_WEBHOOK_SECRET)',
      );
    }
    try {
      WebhookSignatureValidator.validate({
        xSignature,
        xRequestId,
        dataId,
        secret,
      });
    } catch (err) {
      if (err instanceof InvalidWebhookSignatureError) {
        throw new UnauthorizedException('Assinatura do webhook invalida');
      }
      throw err;
    }
  }

  private async getOwner(
    accountId: string,
  ): Promise<{ email: string; nome: string }> {
    const owner = await this.prisma.user.findFirst({
      where: { accountId, role: UserRole.owner },
      orderBy: { criadoEm: 'asc' },
      select: { email: true, nome: true },
    });
    if (!owner) {
      throw new NotFoundException(
        'Conta sem owner, nao e possivel criar assinatura',
      );
    }
    return owner;
  }

  private buildExternalReference(
    accountId: string,
    plan: BillablePlan,
    cycle: BillableCycle,
  ): string {
    return `${accountId}:${plan}:${cycle}`;
  }

  private parseExternalReference(
    externalReference: string | undefined,
  ): { accountId: string; plan: BillablePlan; cycle: BillableCycle } | null {
    if (!externalReference) return null;
    const [accountId, plan, cycle] = externalReference.split(':');
    if (!accountId || (plan !== 'pro' && plan !== 'agencia')) return null;
    if (cycle !== 'MONTHLY' && cycle !== 'ANNUALLY') return null;
    return { accountId, plan, cycle };
  }

  private buildCompletionUrl(): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/configuracoes/plano?status=sucesso`;
  }
}
