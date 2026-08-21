import { Plan } from '@prisma/client';

export type BillableCycle = 'MONTHLY' | 'YEARLY';
export type BillablePlan = Extract<Plan, 'portfolio' | 'pro' | 'agencia'>;

export interface PlanBillingDef {
  description: string;
  value: number;
  cycle: BillableCycle;
}

// Precos aprovados (ver memoria do projeto): Portfolio R$19/mes ou
// R$192/ano; Pro R$69/mes ou R$684/ano; Agencia R$149/mes ou R$1.488/ano.
// Asaas suporta ciclo anual nativamente (cycle: YEARLY), diferente da
// Mercado Pago que so aceitava days/months.
export const PLAN_BILLING: Record<
  BillablePlan,
  Record<BillableCycle, PlanBillingDef>
> = {
  portfolio: {
    MONTHLY: {
      description: 'Vistoow Portfolio (mensal)',
      value: 19,
      cycle: 'MONTHLY',
    },
    YEARLY: {
      description: 'Vistoow Portfolio (anual)',
      value: 192,
      cycle: 'YEARLY',
    },
  },
  pro: {
    MONTHLY: {
      description: 'Vistoow Pro (mensal)',
      value: 69,
      cycle: 'MONTHLY',
    },
    YEARLY: {
      description: 'Vistoow Pro (anual)',
      value: 684,
      cycle: 'YEARLY',
    },
  },
  agencia: {
    MONTHLY: {
      description: 'Vistoow Agencia (mensal)',
      value: 149,
      cycle: 'MONTHLY',
    },
    YEARLY: {
      description: 'Vistoow Agencia (anual)',
      value: 1488,
      cycle: 'YEARLY',
    },
  },
};
