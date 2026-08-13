import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateCheckoutParams {
  name: string;
  email: string;
  cpfCnpj: string;
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  nextDueDate: string;
  description: string;
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl: string;
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
   * Checkout hospedado: a Asaas coleta e armazena o cartão com PCI, cria a
   * assinatura recorrente e devolve somente o identificador da sessão.
   */
  async createCheckout(params: CreateCheckoutParams): Promise<{ url: string }> {
    return this.run('criar checkout', async () => {
      const checkout = await this.request<{ id: string }>('POST', '/checkouts', {
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['RECURRENT'],
        minutesToExpire: 60,
        callback: {
          successUrl: params.successUrl,
          cancelUrl: params.cancelUrl,
          expiredUrl: params.expiredUrl,
          autoRedirect: true,
        },
        items: [
          {
            name: params.description,
            description: params.description,
            quantity: 1,
            value: params.value,
          },
        ],
        customerData: {
          name: params.name,
          email: params.email,
          cpfCnpj: params.cpfCnpj,
        },
        externalReference: params.externalReference,
        subscription: {
          cycle: params.cycle,
          nextDueDate: params.nextDueDate,
        },
      });
      return { url: `${this.checkoutBaseUrl}/checkoutSession/show?id=${checkout.id}` };
    });
  }

  async cancelSubscription(id: string): Promise<void> {
    await this.run('cancelar assinatura', () =>
      this.request('DELETE', `/subscriptions/${id}`),
    );
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
      throw new Error(message);
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
      throw new BadGatewayException(`Falha ao ${action} na Asaas: ${message}`);
    }
  }
}
