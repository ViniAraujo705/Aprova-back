import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SaveCustomerParams {
  name: string;
  email: string;
  cpfCnpj: string;
  phoneNumber: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement?: string;
  province: string;
  externalReference: string;
}

export interface CreateCheckoutParams {
  customer: string;
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  nextDueDate: string;
  description: string;
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
}

interface AsaasPayment {
  subscription?: string;
  status?: string;
}

interface AsaasSubscription {
  id: string;
  status?: string;
}

class AsaasRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Wrapper fino sobre a REST API da Asaas (sem SDK oficial em Node — chama
 * `fetch` direto). Ambiente definido por ASAAS_ENV (default: sandbox), nao
 * pelo formato da API key como na Mercado Pago.
 */
@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    const env = config.get<string>('ASAAS_ENV') ?? 'sandbox';
    this.baseUrl =
      env === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://api-sandbox.asaas.com/v3';
    this.apiKey = config.get<string>('ASAAS_API_KEY') ?? '';
  }

  /**
   * Cria (ou atualiza) o Customer da conta. Ele é a âncora da reconciliação:
   * toda cobrança gerada pelo Checkout carrega o customer no webhook, ao
   * contrário do externalReference, que a Asaas não propaga.
   */
  async saveCustomer(
    params: SaveCustomerParams,
    existingId?: string | null,
  ): Promise<string> {
    return this.run('salvar cliente', async () => {
      const body = {
        name: params.name,
        email: params.email,
        cpfCnpj: params.cpfCnpj,
        mobilePhone: params.phoneNumber,
        postalCode: params.postalCode,
        address: params.address,
        addressNumber: params.addressNumber,
        ...(params.complement ? { complement: params.complement } : {}),
        province: params.province,
        externalReference: params.externalReference,
        // A cobrança é toda por cartão recorrente; avisos de vencimento da
        // Asaas só confundiriam o assinante.
        notificationDisabled: true,
      };
      if (existingId) {
        try {
          const updated = await this.request<{ id: string }>(
            'POST',
            `/customers/${existingId}`,
            body,
          );
          return updated.id;
        } catch (err) {
          // Um id guardado de outro ambiente (sandbox) ou de um cliente
          // removido no painel devolve 404. Nesse caso o cadastro e refeito
          // em vez de travar a contratacao.
          if (!(err instanceof AsaasRequestError) || err.status !== 404)
            throw err;
          this.logger.warn(
            `Customer ${existingId} nao existe nesta conta Asaas, recriando`,
          );
        }
      }
      const created = await this.request<{ id: string }>(
        'POST',
        '/customers',
        body,
      );
      return created.id;
    });
  }

  /**
   * Checkout hospedado: a Asaas coleta e armazena o cartão com PCI e cria a
   * assinatura recorrente já vinculada ao Customer informado.
   */
  async createCheckout(
    params: CreateCheckoutParams,
  ): Promise<{ url: string; id: string }> {
    return this.run('criar checkout', async () => {
      const checkout = await this.request<{ id: string; link?: string }>(
        'POST',
        '/checkouts',
        {
          billingTypes: ['CREDIT_CARD'],
          chargeTypes: ['RECURRENT'],
          minutesToExpire: 60,
          callback: {
            successUrl: params.successUrl,
            cancelUrl: params.cancelUrl,
            expiredUrl: params.expiredUrl,
          },
          items: [
            {
              name: params.description,
              description: params.description,
              quantity: 1,
              value: params.value,
            },
          ],
          customer: params.customer,
          // Só aparece no painel da Asaas: a reconciliação não depende dele.
          externalReference: params.externalReference,
          subscription: {
            cycle: params.cycle,
            nextDueDate: params.nextDueDate,
          },
        },
      );
      return {
        id: checkout.id,
        // A API atual já devolve o link pronto. Mantém fallback para versões
        // antigas da API que retornavam somente o identificador da sessão.
        url:
          checkout.link ??
          `${this.checkoutBaseUrl}/checkoutSession/show/${checkout.id}`,
      };
    });
  }

  async cancelSubscription(id: string): Promise<void> {
    await this.run('cancelar assinatura', () =>
      this.request('DELETE', `/subscriptions/${id}`),
    );
  }

  /**
   * Invalida uma sessão de checkout ainda aberta. Best-effort: uma sessão já
   * paga, expirada ou cancelada devolve erro, e isso não deve impedir o
   * assinante de abrir um checkout novo.
   */
  async cancelCheckout(id: string): Promise<void> {
    try {
      await this.request('POST', `/checkouts/${id}/cancel`);
    } catch {
      this.logger.warn(`Checkout ${id} nao pode mais ser cancelado`);
    }
  }

  /**
   * Consulta pontual usada no retorno do Checkout caso o webhook ainda não
   * tenha sido entregue. Não substitui o webhook nem faz polling contínuo.
   *
   * A busca é pelo customer porque o Checkout não repassa o
   * externalReference para a assinatura nem para as cobranças que cria.
   */
  async findConfirmedSubscription(customer: string): Promise<string | null> {
    return this.run('consultar assinatura', async () => {
      const query = new URLSearchParams({ customer, limit: '10' });
      const subscriptions = await this.request<{ data: AsaasSubscription[] }>(
        'GET',
        `/subscriptions?${query.toString()}&status=ACTIVE`,
      );

      for (const subscription of subscriptions.data) {
        // Assinatura ativa ainda não é assinatura paga: o acesso só é
        // liberado depois que a primeira cobrança é confirmada.
        const payments = await this.request<{ data: AsaasPayment[] }>(
          'GET',
          `/subscriptions/${subscription.id}/payments`,
        );
        if (payments.data.some((payment) => this.isPaid(payment.status))) {
          return subscription.id;
        }
      }
      return null;
    });
  }

  private isPaid(status: string | undefined): boolean {
    return status === 'CONFIRMED' || status === 'RECEIVED';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => undefined);
    if (!res.ok) {
      const message = json?.errors?.[0]?.description ?? `HTTP ${res.status}`;
      throw new AsaasRequestError(message, res.status);
    }
    return json as T;
  }

  private get checkoutBaseUrl(): string {
    return this.baseUrl.includes('sandbox')
      ? 'https://sandbox.asaas.com'
      : 'https://www.asaas.com';
  }

  private async run<T>(action: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'erro desconhecido';
      this.logger.error(`Asaas falhou ao ${action}: ${message}`);
      if (err instanceof AsaasRequestError) {
        if (err.status === 400) {
          throw new BadRequestException(`Asaas recusou o checkout: ${message}`);
        }
        if (err.status === 401) {
          throw new UnauthorizedException('Chave de API da Asaas invalida');
        }
      }
      throw new BadGatewayException(`Falha ao ${action} na Asaas: ${message}`);
    }
  }
}
