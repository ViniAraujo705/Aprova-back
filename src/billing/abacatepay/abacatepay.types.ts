import { BillableCycle } from '../plan-products.config';

export interface AbacatePayResponse<T> {
  data: T | null;
  error: string | null;
  success?: boolean;
}

export interface AbacatePayProduct {
  id: string;
  externalId: string | null;
  name: string;
  price: number;
  currency: string;
  cycle: BillableCycle | null;
}

export interface AbacatePayCustomer {
  id: string;
  email: string;
  name?: string | null;
}

export interface CreateProductParams {
  externalId: string;
  name: string;
  price: number;
  cycle: BillableCycle;
}

export interface CreateCustomerParams {
  email: string;
  name?: string;
}

export interface CreateSubscriptionCheckoutParams {
  productId: string;
  customerId?: string;
  externalId: string;
  methods?: Array<'PIX' | 'CARD'>;
  completionUrl?: string;
}

export interface AbacatePaySubscription {
  id: string;
  status: string;
}

export interface AbacatePayWebhookPayload {
  id: string;
  event: string;
  apiVersion: number;
  devMode: boolean;
  data: {
    subscription?: { id: string; status: string };
    customer?: { id: string; email?: string; name?: string };
    checkout?: {
      id: string;
      externalId: string | null;
      items: Array<{ id: string; quantity: number }>;
    };
  };
}
