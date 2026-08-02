import { Plan } from '@prisma/client';

export type BillableCycle = 'MONTHLY' | 'ANNUALLY';
export type BillablePlan = Extract<Plan, 'pro' | 'agencia'>;

export interface PlanProductDef {
  // Identifica o produto na AbacatePay (nao muda entre sandbox/producao;
  // o productId real e resolvido em runtime via BillingProductsService).
  externalId: string;
  name: string;
  priceCents: number;
}

// Precos aprovados (ver memoria do projeto): Pro R$59/mes ou R$588/ano;
// Agencia R$149/mes ou R$1.490/ano.
export const PLAN_PRODUCTS: Record<
  BillablePlan,
  Record<BillableCycle, PlanProductDef>
> = {
  pro: {
    MONTHLY: {
      externalId: 'vistoow-pro-mensal',
      name: 'Vistoow Pro (mensal)',
      priceCents: 5900,
    },
    ANNUALLY: {
      externalId: 'vistoow-pro-anual',
      name: 'Vistoow Pro (anual)',
      priceCents: 58800,
    },
  },
  agencia: {
    MONTHLY: {
      externalId: 'vistoow-agencia-mensal',
      name: 'Vistoow Agencia (mensal)',
      priceCents: 14900,
    },
    ANNUALLY: {
      externalId: 'vistoow-agencia-anual',
      name: 'Vistoow Agencia (anual)',
      priceCents: 149000,
    },
  },
};
