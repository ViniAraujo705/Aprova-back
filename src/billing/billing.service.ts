import * as crypto from 'crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacatePayService } from './abacatepay/abacatepay.service';
import { AbacatePayWebhookPayload } from './abacatepay/abacatepay.types';
import { BillingProductsService } from './billing-products.service';
import { BillableCycle, BillablePlan } from './plan-products.config';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly abacatepay: AbacatePayService,
    private readonly products: BillingProductsService,
    private readonly config: ConfigService,
  ) {}

  /** Cria o checkout de assinatura e devolve a URL de pagamento hospedada. */
  async createCheckout(
    accountId: string,
    plan: BillablePlan,
    cycle: BillableCycle,
  ): Promise<{ url: string }> {
    const customerId = await this.ensureCustomer(accountId);
    const productId = await this.products.resolveProductId(plan, cycle);

    const checkout = await this.abacatepay.createSubscriptionCheckout({
      productId,
      customerId,
      externalId: accountId,
      completionUrl: this.buildCompletionUrl(),
    });

    return { url: checkout.url };
  }

  /**
   * Cancela a assinatura ativa e ja rebaixa a conta pra free na hora (sem
   * esperar o webhook — mesma politica "sem periodo de graca" da propria
   * AbacatePay). O webhook de subscription.cancelled que chegar depois e
   * inofensivo (so confirma o que ja foi feito aqui).
   */
  async cancel(accountId: string): Promise<{ plan: Plan }> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { abacatepaySubscriptionId: true },
    });
    if (!account.abacatepaySubscriptionId) {
      throw new BadRequestException(
        'Esta conta nao tem assinatura ativa para cancelar',
      );
    }

    await this.abacatepay.cancelSubscription(account.abacatepaySubscriptionId);
    await this.prisma.account.update({
      where: { id: accountId },
      data: { plan: Plan.free },
    });
    return { plan: Plan.free };
  }

  /** Valida a assinatura do webhook e processa o evento. */
  async processWebhook(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    secretQuery: string | undefined,
  ): Promise<void> {
    const payload = this.verifyAndParse(rawBody, signatureHeader, secretQuery);
    await this.handleEvent(payload);
  }

  private verifyAndParse(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
    secretQuery: string | undefined,
  ): AbacatePayWebhookPayload {
    const expectedSecret = this.config.get<string>('ABACATEPAY_WEBHOOK_SECRET');
    const signingKey = this.config.get<string>(
      'ABACATEPAY_WEBHOOK_SIGNING_KEY',
    );
    if (!expectedSecret || !signingKey) {
      throw new BadGatewayException(
        'Webhook da AbacatePay nao configurado (faltam env vars)',
      );
    }
    if (!rawBody || !signatureHeader || secretQuery !== expectedSecret) {
      throw new UnauthorizedException('Webhook invalido');
    }

    const expected = Buffer.from(
      crypto.createHmac('sha256', signingKey).update(rawBody).digest('base64'),
    );
    const provided = Buffer.from(signatureHeader);
    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      throw new UnauthorizedException('Assinatura do webhook invalida');
    }

    return JSON.parse(rawBody.toString('utf8')) as AbacatePayWebhookPayload;
  }

  private async handleEvent(payload: AbacatePayWebhookPayload): Promise<void> {
    switch (payload.event) {
      case 'subscription.completed':
      case 'subscription.renewed':
        await this.applySubscriptionActive(payload.data);
        return;
      case 'subscription.cancelled':
        await this.applySubscriptionCancelled(payload.data);
        return;
      case 'subscription.payment_failed':
        this.logger.warn(
          `Pagamento falhou para subscription ${payload.data.subscription?.id} (retry automatico da AbacatePay, sem mudanca de plano)`,
        );
        return;
      default:
        this.logger.log(`Evento de webhook ignorado: ${payload.event}`);
    }
  }

  private async applySubscriptionActive(
    data: AbacatePayWebhookPayload['data'],
  ): Promise<void> {
    const subscriptionId = data.subscription?.id;
    const customerId = data.customer?.id;
    const productId = data.checkout?.items?.[0]?.id;
    const externalId = data.checkout?.externalId ?? undefined;

    if (!subscriptionId || !productId) {
      this.logger.warn(
        'Webhook de assinatura sem subscription.id ou productId, ignorando',
      );
      return;
    }

    const resolved = await this.products.resolvePlanFromProductId(productId);
    if (!resolved) {
      this.logger.warn(
        `Produto ${productId} nao mapeado para nenhum plano, ignorando webhook`,
      );
      return;
    }

    const account = externalId
      ? await this.prisma.account.findUnique({
          where: { id: externalId },
          select: { id: true },
        })
      : await this.prisma.account.findUnique({
          where: { abacatepaySubscriptionId: subscriptionId },
          select: { id: true },
        });

    if (!account) {
      this.logger.error(
        `Nao foi possivel identificar a conta do webhook (externalId=${externalId}, subscriptionId=${subscriptionId})`,
      );
      return;
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        plan: resolved.plan,
        abacatepaySubscriptionId: subscriptionId,
        ...(customerId ? { abacatepayCustomerId: customerId } : {}),
      },
    });
  }

  private async applySubscriptionCancelled(
    data: AbacatePayWebhookPayload['data'],
  ): Promise<void> {
    const subscriptionId = data.subscription?.id;
    if (!subscriptionId) return;

    const account = await this.prisma.account.findUnique({
      where: { abacatepaySubscriptionId: subscriptionId },
      select: { id: true, plan: true },
    });
    if (!account) {
      this.logger.warn(
        `Webhook de cancelamento para subscription desconhecida: ${subscriptionId}`,
      );
      return;
    }
    if (account.plan === Plan.free) {
      return; // ja foi rebaixada via cancel() — webhook so confirma
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { plan: Plan.free },
    });
  }

  private async ensureCustomer(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        abacatepayCustomerId: true,
        users: {
          where: { role: UserRole.owner },
          orderBy: { criadoEm: 'asc' },
          take: 1,
          select: { nome: true, email: true },
        },
      },
    });
    if (account.abacatepayCustomerId) {
      return account.abacatepayCustomerId;
    }

    const owner = account.users[0];
    if (!owner) {
      throw new NotFoundException(
        'Conta sem owner, nao e possivel criar assinatura',
      );
    }

    const customer = await this.abacatepay.createCustomer({
      email: owner.email,
      name: owner.nome,
    });
    await this.prisma.account.update({
      where: { id: accountId },
      data: { abacatepayCustomerId: customer.id },
    });
    return customer.id;
  }

  private buildCompletionUrl(): string {
    const base = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      .trim();
    const origin = base && base !== '*' ? base : 'http://localhost:5173';
    return `${origin}/configuracoes/plano?status=sucesso`;
  }
}
