import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CreateCustomerParams {
  name: string;
  email: string;
  cpfCnpj: string;
}

export interface CreateSubscriptionParams {
  customerId: string;
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  nextDueDate: string;
  description: string;
  externalReference: string;
  successUrl: string;
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

  async createCustomer(params: CreateCustomerParams): Promise<{ id: string }> {
    return this.run('criar cliente', () =>
      this.request<{ id: string }>('POST', '/customers', {
        name: params.name,
        email: params.email,
        cpfCnpj: params.cpfCnpj,
      }),
    );
  }

  async createSubscription(
    params: CreateSubscriptionParams,
  ): Promise<{ id: string }> {
    return this.run('criar assinatura', () =>
      this.request<{ id: string }>('POST', '/subscriptions', {
        customer: params.customerId,
        // Assinaturas recorrentes precisam nascer vinculadas ao cartão para
        // que a fatura hospedada exiba o formulário de cartão. `UNDEFINED`
        // depende das formas habilitadas na conta Asaas e, no Sandbox, pode
        // resultar em uma fatura apenas de boleto.
        billingType: 'CREDIT_CARD',
        value: params.value,
        nextDueDate: params.nextDueDate,
        cycle: params.cycle,
        description: params.description,
        externalReference: params.externalReference,
        callback: {
          successUrl: params.successUrl,
          autoRedirect: true,
        },
      }),
    );
  }

  /** Busca a fatura gerada pela assinatura pra pegar a URL de checkout. */
  async getFirstPaymentInvoiceUrl(
    subscriptionId: string,
  ): Promise<string | undefined> {
    return this.run('buscar fatura da assinatura', async () => {
      const result = await this.request<{
        data: Array<{ invoiceUrl?: string }>;
      }>('GET', `/payments?subscription=${subscriptionId}`);
      return result.data?.[0]?.invoiceUrl;
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
