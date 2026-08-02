import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbacatePayCustomer,
  AbacatePayProduct,
  AbacatePayResponse,
  AbacatePaySubscription,
  CreateCustomerParams,
  CreateProductParams,
  CreateSubscriptionCheckoutParams,
} from './abacatepay.types';

/**
 * Cliente HTTP fino para a API da AbacatePay (v2). O ambiente (sandbox vs
 * producao) e definido pela propria chave usada em ABACATEPAY_API_KEY, nao
 * por config separada aqui.
 */
@Injectable()
export class AbacatePayService {
  private readonly logger = new Logger(AbacatePayService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ABACATEPAY_API_KEY') ?? '';
    this.baseUrl =
      config.get<string>('ABACATEPAY_BASE_URL') ??
      'https://api.abacatepay.com/v2';
  }

  listProducts(): Promise<AbacatePayProduct[]> {
    return this.request<AbacatePayProduct[]>('GET', '/products/list');
  }

  createProduct(dto: CreateProductParams): Promise<AbacatePayProduct> {
    return this.request<AbacatePayProduct>('POST', '/products/create', {
      ...dto,
      currency: 'BRL',
    });
  }

  createCustomer(dto: CreateCustomerParams): Promise<AbacatePayCustomer> {
    return this.request<AbacatePayCustomer>('POST', '/customers/create', dto);
  }

  createSubscriptionCheckout(
    params: CreateSubscriptionCheckoutParams,
  ): Promise<{ url: string }> {
    return this.request<{ url: string }>('POST', '/subscriptions/create', {
      items: [{ id: params.productId, quantity: 1 }],
      customerId: params.customerId,
      externalId: params.externalId,
      // PIX recorrente ("PIX Automatico") exige habilitacao separada da
      // loja na AbacatePay (autorizacao bancaria de debito recorrente) —
      // por enquanto so cartao funciona pra assinatura. Ajustar pra
      // ["PIX", "CARD"] quando a loja tiver isso habilitado.
      methods: params.methods ?? ['CARD'],
      completionUrl: params.completionUrl,
      retryPolicy: { maxRetry: 3, retryEvery: 2 },
    });
  }

  cancelSubscription(subscriptionId: string): Promise<AbacatePaySubscription> {
    return this.request<AbacatePaySubscription>(
      'POST',
      '/subscriptions/cancel',
      { id: subscriptionId },
    );
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new BadGatewayException('ABACATEPAY_API_KEY nao configurada');
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as AbacatePayResponse<T>;
    if (!res.ok || json.error || json.data === null) {
      this.logger.error(
        `AbacatePay ${method} ${path} falhou (${res.status}): ${
          json.error ?? res.statusText
        }`,
      );
      throw new BadGatewayException(
        json.error ?? 'Falha ao comunicar com a AbacatePay',
      );
    }
    return json.data;
  }
}
