import { Plan } from '@prisma/client';

export type BillableCycle = 'MONTHLY' | 'YEARLY';
export type BillablePlan = Extract<Plan, 'pro' | 'agencia'>;

export interface PlanBillingDef {
  description: string;
  value: number;
  cycle: BillableCycle;
}

// Precos aprovados (ver memoria do projeto): Pro R$59/mes ou R$588/ano;
// Agencia R$169/mes ou R$1.690/ano. Asaas suporta ciclo anual nativamente
// (cycle: YEARLY), diferente da Mercado Pago que so aceitava days/months.
export const PLAN_BILLING: Record<
  BillablePlan,
  Record<BillableCycle, PlanBillingDef>
> = {
  pro: {
    MONTHLY: {
      description: 'Vistoow Pro (mensal)',
      value: 59,
      cycle: 'MONTHLY',
    },
    YEARLY: {
      description: 'Vistoow Pro (anual)',
      value: 588,
      cycle: 'YEARLY',
    },
  },
  agencia: {
    MONTHLY: {
      description: 'Vistoow Agencia (mensal)',
      value: 169,
      cycle: 'MONTHLY',
    },
    YEARLY: {
      description: 'Vistoow Agencia (anual)',
      value: 1690,
      cycle: 'YEARLY',
    },
  },
};
