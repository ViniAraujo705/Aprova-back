import {
  BadRequestException,
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

  /** Cria (ou reaproveita) o Customer, cria a assinatura e devolve a URL da fatura pra redirecionar o payer. */
  async createCheckout(
    accountId: string,
    plan: BillablePlan,
    cycle: BillableCycle,
    cpfCnpj: string,
  ): Promise<{ url: string }> {
    const owner = await this.getOwner(accountId);
    const def = PLAN_BILLING[plan][cycle];

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { asaasCustomerId: true, asaasSubscriptionId: true, plan: true },
    });

    // Um clique repetido (ou uma falha de rede depois de criar a assinatura)
    // deve reabrir a mesma fatura pendente, nunca criar outra recorrência.
    if (account.asaasSubscriptionId) {
      if (account.plan !== Plan.free) {
        throw new BadRequestException(
          'Esta conta ja possui uma assinatura ativa. Cancele-a antes de trocar de plano.',
        );
      }
      const invoiceUrl = await this.asaas.getFirstPaymentInvoiceUrl(
        account.asaasSubscriptionId,
      );
      if (!invoiceUrl) {
        throw new BadRequestException(
          'Nao foi possivel recuperar a fatura pendente da Asaas',
        );
      }
      return { url: invoiceUrl };
    }

    let customerId = account.asaasCustomerId;
    if (!customerId) {
      const customer = await this.asaas.createCustomer({
        name: owner.nome,
        email: owner.email,
        cpfCnpj,
      });
      customerId = customer.id;
    }

    const subscription = await this.asaas.createSubscription({
      customerId,
      value: def.value,
      cycle: def.cycle,
      nextDueDate: new Date().toISOString().slice(0, 10),
      description: def.description,
      externalReference: this.buildExternalReference(accountId, plan, cycle),
      successUrl: this.buildCheckoutSuccessUrl(),
    });

    await this.prisma.account.update({
      where: { id: accountId },
      // Persiste a assinatura antes de devolver a URL. Isso evita criar uma
      // assinatura recorrente sem que a conta consiga cancelá-la se a busca
      // da fatura falhar numa tentativa posterior.
      data: {
        asaasCustomerId: customerId,
        asaasSubscriptionId: subscription.id,
        cpfCnpj,
      },
    });

    const invoiceUrl = await this.asaas.getFirstPaymentInvoiceUrl(
      subscription.id,
    );
    if (!invoiceUrl) {
      throw new BadRequestException('Asaas nao retornou uma URL de checkout');
    }

    return { url: invoiceUrl };
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
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim()
      .replace(/\/+$/, '');

    if (!base || base === '*') {
      throw new BadRequestException(
        'CORS_ORIGIN deve apontar para o frontend para iniciar o checkout',
      );
    }

    return `${base}/configuracoes/plano?status=sucesso`;
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
}
