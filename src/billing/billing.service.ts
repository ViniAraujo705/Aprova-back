import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AsaasService } from './asaas/asaas.service';
import {
  PLAN_BILLING,
  BillableCycle,
  BillablePlan,
} from './plan-billing.config';

interface AsaasWebhookPayment {
  subscription?: string;
  externalReference?: string;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly config: ConfigService,
  ) {}

  /** Cria uma sessão de checkout hospedada que coleta o cartão e cria a assinatura recorrente. */
  async createCheckout(
    accountId: string,
    plan: BillablePlan,
    cycle: BillableCycle,
    cpfCnpj: string,
    phoneNumber: string,
    postalCode: string,
    address: string,
    addressNumber: string,
    complement: string | undefined,
    province: string,
  ): Promise<{ url: string }> {
    const owner = await this.getOwner(accountId);
    const def = PLAN_BILLING[plan][cycle];

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { asaasSubscriptionId: true, plan: true },
    });

    // Depois de um pagamento confirmado, uma nova contratação exige cancelar
    // a assinatura vigente primeiro. Antes da confirmação não há assinatura:
    // o Checkout expira em 60 minutos e não cria recorrência sozinho.
    if (account.asaasSubscriptionId) {
      throw new BadRequestException(
        'Esta conta ja possui uma assinatura ativa. Cancele-a antes de trocar de plano.',
      );
    }

    const checkout = await this.asaas.createCheckout({
      name: owner.nome,
      email: owner.email,
      cpfCnpj,
      phoneNumber,
      postalCode,
      address,
      addressNumber,
      complement,
      province,
      city: await this.findCityIbge(postalCode),
      value: def.value,
      cycle: def.cycle,
      nextDueDate: new Date().toISOString().slice(0, 10),
      description: def.description,
      externalReference: this.buildExternalReference(accountId, plan, cycle),
      successUrl: this.buildCheckoutSuccessUrl(),
      cancelUrl: this.buildCheckoutReturnUrl('cancelado'),
      expiredUrl: this.buildCheckoutReturnUrl('expirado'),
    });

    return checkout;
  }

  /**
   * Cancela a assinatura ativa e ja rebaixa a conta pra free na hora (sem
   * esperar o webhook). O webhook de cancelamento que chegar depois e
   * inofensivo (so confirma o que ja foi feito aqui).
   */
  async cancel(accountId: string): Promise<{ plan: Plan }> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { asaasSubscriptionId: true },
    });
    if (!account.asaasSubscriptionId) {
      throw new BadRequestException(
        'Esta conta nao tem assinatura ativa para cancelar',
      );
    }

    await this.asaas.cancelSubscription(account.asaasSubscriptionId);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { plan: Plan.free, asaasSubscriptionId: null },
    });
    return { plan: Plan.free };
  }

  /**
   * Valida o token do webhook e processa a notificacao. Diferente da
   * Mercado Pago, o payload da Asaas ja vem completo (nao precisa buscar o
   * estado na API) e a autenticacao e um token simples, nao HMAC.
   */
  async processWebhook(
    token: string | undefined,
    event: string | undefined,
    payment: AsaasWebhookPayment | undefined,
  ): Promise<void> {
    this.verifyWebhookToken(token);

    if (!payment?.subscription) {
      this.logger.warn(
        `Webhook Asaas sem payment.subscription, ignorando (event=${event})`,
      );
      return;
    }

    const parsed = this.parseExternalReference(payment.externalReference);
    if (!parsed) {
      this.logger.error(
        `Webhook da assinatura ${payment.subscription} sem externalReference reconhecivel`,
      );
      return;
    }

    const account = await this.prisma.account.findUnique({
      where: { id: parsed.accountId },
      select: { asaasSubscriptionId: true, plan: true },
    });
    if (!account) {
      this.logger.warn(
        `Webhook Asaas para conta inexistente: ${parsed.accountId}`,
      );
      return;
    }
    if (
      account.asaasSubscriptionId &&
      account.asaasSubscriptionId !== payment.subscription
    ) {
      this.logger.warn(
        `Webhook Asaas de assinatura antiga ignorado: ${payment.subscription}`,
      );
      return;
    }

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      await this.prisma.account.update({
        where: { id: parsed.accountId },
        data: {
          plan: parsed.plan,
          asaasSubscriptionId: payment.subscription,
        },
      });
    } else if (
      event === 'SUBSCRIPTION_DELETED' ||
      event === 'PAYMENT_DELETED'
    ) {
      if (account.plan !== Plan.free || account.asaasSubscriptionId) {
        await this.prisma.account.update({
          where: { id: parsed.accountId },
          data: { plan: Plan.free, asaasSubscriptionId: null },
        });
      }
    } else {
      this.logger.log(`Evento de webhook Asaas ignorado: ${event}`);
    }
  }

  private verifyWebhookToken(token: string | undefined): void {
    const expected = this.config.get<string>('ASAAS_WEBHOOK_TOKEN');
    if (!expected) {
      throw new UnauthorizedException(
        'Webhook da Asaas nao configurado (falta ASAAS_WEBHOOK_TOKEN)',
      );
    }
    if (!token || token !== expected) {
      throw new UnauthorizedException('Token do webhook invalido');
    }
  }

  private async getOwner(
    accountId: string,
  ): Promise<{ email: string; nome: string }> {
    const membership = await this.prisma.membership.findFirst({
      where: { accountId, role: UserRole.owner },
      orderBy: { criadoEm: 'asc' },
      select: { user: { select: { email: true, nome: true } } },
    });
    if (!membership) {
      throw new NotFoundException(
        'Conta sem owner, nao e possivel criar assinatura',
      );
    }
    return membership.user;
  }

  private buildExternalReference(
    accountId: string,
    plan: BillablePlan,
    cycle: BillableCycle,
  ): string {
    return `${accountId}:${plan}:${cycle}`;
  }

  private buildCheckoutSuccessUrl(): string {
    return this.buildCheckoutReturnUrl('sucesso');
  }

  private buildCheckoutReturnUrl(status: 'sucesso' | 'cancelado' | 'expirado'): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');

    if (!base || base === '*') {
      throw new BadRequestException(
        'CORS_ORIGIN deve apontar para o frontend para iniciar o checkout',
      );
    }

    return `${base}/configuracoes/plano?status=${status}`;
  }

  private parseExternalReference(
    externalReference: string | undefined,
  ): { accountId: string; plan: BillablePlan; cycle: BillableCycle } | null {
    if (!externalReference) return null;
    const [accountId, plan, cycle] = externalReference.split(':');
    if (!accountId || (plan !== 'pro' && plan !== 'agencia')) return null;
    if (cycle !== 'MONTHLY' && cycle !== 'YEARLY') return null;
    return { accountId, plan, cycle };
  }

  /**
   * A Asaas recebe a cidade como código IBGE. Para não exigir esse código
   * técnico no checkout, o backend o resolve de forma confiável a partir do
   * CEP informado pelo pagador.
   */
  private async findCityIbge(postalCode: string): Promise<number> {
    try {
      const res = await fetch(`https://viacep.com.br/ws/${postalCode}/json/`);
      const data = (await res.json()) as { erro?: boolean; ibge?: string };
      const city = Number(data.ibge);
      if (!res.ok || data.erro || !Number.isInteger(city) || city <= 0) {
        throw new BadRequestException('CEP invalido ou sem cidade identificada');
      }
      return city;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Falha ao consultar CEP ${postalCode}`);
      throw new BadGatewayException('Nao foi possivel consultar o CEP agora');
    }
  }
}
