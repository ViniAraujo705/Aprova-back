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
import { resolveFrontendUrl } from '../common/frontend-url.util';

/**
 * Payload dos webhooks da Asaas. Eventos de cobranca trazem `payment`;
 * SUBSCRIPTION_DELETED traz `subscription`. Nenhum dos dois carrega o
 * externalReference do Checkout — dai a reconciliacao pelo customer.
 */
export interface AsaasWebhookBody {
  event?: string;
  payment?: { customer?: string; subscription?: string };
  subscription?: { id?: string; customer?: string };
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
      select: {
        asaasCustomerId: true,
        asaasSubscriptionId: true,
        asaasCheckoutId: true,
      },
    });

    // Depois de um pagamento confirmado, uma nova contratação exige cancelar
    // a assinatura vigente primeiro. Antes da confirmação não há assinatura:
    // o Checkout expira em 60 minutos e não cria recorrência sozinho.
    if (account.asaasSubscriptionId) {
      throw new BadRequestException(
        'Esta conta ja possui uma assinatura ativa. Cancele-a antes de trocar de plano.',
      );
    }

    // Sem isso, um checkout anterior ainda aberto poderia ser pago depois
    // deste e liberar o plano errado — o plano contratado é sobrescrito logo
    // abaixo e a conta só guarda um.
    if (account.asaasCheckoutId) {
      await this.asaas.cancelCheckout(account.asaasCheckoutId);
    }

    // O Customer é reaproveitado entre checkouts e é por ele que os webhooks
    // de cobrança encontram a conta. A Asaas resolve a cidade pelo CEP.
    const customerId = await this.asaas.saveCustomer(
      {
        name: owner.nome,
        email: owner.email,
        cpfCnpj,
        phoneNumber,
        postalCode,
        address,
        addressNumber,
        complement,
        province,
        externalReference: accountId,
      },
      account.asaasCustomerId,
    );

    // Gravado antes de abrir o checkout: se a criacao falhar, a proxima
    // tentativa reaproveita este Customer em vez de cadastrar um duplicado.
    await this.prisma.account.update({
      where: { id: accountId },
      data: { asaasCustomerId: customerId, cpfCnpj },
    });

    const checkout = await this.asaas.createCheckout({
      customer: customerId,
      value: def.value,
      cycle: def.cycle,
      nextDueDate: new Date().toISOString().slice(0, 10),
      description: def.description,
      externalReference: `${accountId}:${plan}:${cycle}`,
      successUrl: this.buildCheckoutReturnUrl('sucesso'),
      cancelUrl: this.buildCheckoutReturnUrl('cancelado'),
      expiredUrl: this.buildCheckoutReturnUrl('expirado'),
    });

    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        asaasCheckoutId: checkout.id,
        asaasPlan: plan,
        asaasCycle: cycle,
      },
    });

    return { url: checkout.url };
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
      data: this.clearedSubscription(),
    });
    return { plan: Plan.free };
  }

  /**
   * Reconciliação pontual ao retornar da página hospedada. Ela cobre uma
   * entrega atrasada do webhook, mas a confirmação sempre vem da API Asaas.
   */
  async syncCheckout(accountId: string): Promise<{ plan: Plan }> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        plan: true,
        asaasPlan: true,
        asaasCustomerId: true,
        asaasSubscriptionId: true,
      },
    });

    if (account.asaasSubscriptionId) return { plan: account.plan };
    if (!account.asaasCustomerId || !account.asaasPlan) {
      return { plan: account.plan };
    }

    const subscription = await this.asaas.findConfirmedSubscription(
      account.asaasCustomerId,
    );
    if (!subscription) return { plan: account.plan };

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: { plan: account.asaasPlan, asaasSubscriptionId: subscription },
      select: { plan: true },
    });
    this.logger.log(
      `Plano reconciliado após retorno do checkout para conta ${accountId}`,
    );
    return { plan: updated.plan };
  }

  /**
   * Valida o token do webhook e processa a notificacao. O payload da Asaas ja
   * vem completo (nao precisa buscar o estado na API), e a conta e encontrada
   * pelo customer: o externalReference do Checkout nao chega ate aqui.
   */
  async processWebhook(
    token: string | undefined,
    body: AsaasWebhookBody | undefined,
  ): Promise<void> {
    this.verifyWebhookToken(token);

    const event = body?.event;
    const customerId = body?.payment?.customer ?? body?.subscription?.customer;
    const subscriptionId =
      body?.payment?.subscription ?? body?.subscription?.id;

    if (!customerId) {
      this.logger.warn(
        `Webhook Asaas sem customer, ignorando (event=${event})`,
      );
      return;
    }

    const account = await this.prisma.account.findFirst({
      where: { asaasCustomerId: customerId },
      select: {
        id: true,
        plan: true,
        asaasPlan: true,
        asaasSubscriptionId: true,
      },
    });
    if (!account) {
      this.logger.warn(
        `Webhook Asaas para customer sem conta: ${customerId} (event=${event})`,
      );
      return;
    }

    // Uma cobranca avulsa ou de uma assinatura ja substituida nao pode mexer
    // no plano em vigor.
    if (
      account.asaasSubscriptionId &&
      subscriptionId &&
      account.asaasSubscriptionId !== subscriptionId
    ) {
      this.logger.warn(
        `Webhook Asaas de assinatura antiga ignorado: ${subscriptionId}`,
      );
      return;
    }

    // Sem plano contratado a conta nao esta sob controle da cobranca — pode
    // ter sido promovida a mao pelo admin (PATCH /admin/accounts/:id/plan), e
    // um webhook nao deve rebaixa-la.
    if (!account.asaasPlan) {
      this.logger.warn(
        `Webhook ${event} para conta ${account.id} sem plano contratado, ignorado`,
      );
      return;
    }

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        await this.prisma.account.update({
          where: { id: account.id },
          data: {
            plan: account.asaasPlan,
            ...(subscriptionId ? { asaasSubscriptionId: subscriptionId } : {}),
          },
        });
        this.logger.log(
          `Conta ${account.id} ativada no plano ${account.asaasPlan} (assinatura ${subscriptionId})`,
        );
        return;

      // Cobranca vencida suspende o acesso mas preserva asaasPlan: a Asaas
      // segue tentando o cartao, e o proximo PAYMENT_CONFIRMED restaura.
      case 'PAYMENT_OVERDUE':
        if (account.plan !== Plan.free) {
          await this.prisma.account.update({
            where: { id: account.id },
            data: { plan: Plan.free },
          });
          this.logger.log(
            `Conta ${account.id} suspensa por cobranca vencida (plano contratado: ${account.asaasPlan})`,
          );
        }
        return;

      case 'SUBSCRIPTION_DELETED':
      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED':
        await this.prisma.account.update({
          where: { id: account.id },
          data: this.clearedSubscription(),
        });
        this.logger.log(
          `Assinatura da conta ${account.id} encerrada: ${event}`,
        );
        return;

      default:
        this.logger.log(`Evento de webhook Asaas ignorado: ${event}`);
    }
  }

  /** Volta a conta pro free e apaga o vinculo com a assinatura encerrada. */
  private clearedSubscription() {
    return {
      plan: Plan.free,
      asaasSubscriptionId: null,
      asaasPlan: null,
      asaasCycle: null,
      asaasCheckoutId: null,
    };
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

  private buildCheckoutReturnUrl(
    status: 'sucesso' | 'cancelado' | 'expirado',
  ): string {
    const base = resolveFrontendUrl(this.config);

    if (!base) {
      throw new BadRequestException(
        'FRONTEND_URL (ou CORS_ORIGIN) deve apontar para o frontend para iniciar o checkout',
      );
    }

    return `${base}/configuracoes/plano?status=${status}`;
  }
}
