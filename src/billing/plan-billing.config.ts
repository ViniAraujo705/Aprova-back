import { Plan } from '@prisma/client';

export type BillableCycle = 'MONTHLY' | 'ANNUALLY';
export type BillablePlan = Extract<Plan, 'pro' | 'agencia'>;

export interface PlanBillingDef {
  reason: string;
  transactionAmount: number;
  // Mercado Pago so aceita "days" ou "months" (nao existe "years"); anual
  // cobra o valor cheio a cada 12 meses.
  frequency: number;
  frequencyType: 'months';
}

// Precos aprovados (ver memoria do projeto): Pro R$59/mes ou R$588/ano;
// Agencia R$149/mes ou R$1.490/ano.
export const PLAN_BILLING: Record<
  BillablePlan,
  Record<BillableCycle, PlanBillingDef>
> = {
  pro: {
    MONTHLY: {
      reason: 'Vistoow Pro (mensal)',
      // TESTE REAL EM PRODUCAO: valor reduzido temporariamente pro minimo aceito
      // pela Mercado Pago (R$0.50). Reverter pra 59 assim que o teste terminar.
      transactionAmount: 0.5,
      frequency: 1,
      frequencyType: 'months',
    },
    ANNUALLY: {
      reason: 'Vistoow Pro (anual)',
      transactionAmount: 588,
      frequency: 12,
      frequencyType: 'months',
    },
  },
  agencia: {
    MONTHLY: {
      reason: 'Vistoow Agencia (mensal)',
      transactionAmount: 149,
      frequency: 1,
      frequencyType: 'months',
    },
    ANNUALLY: {
      reason: 'Vistoow Agencia (anual)',
      transactionAmount: 1490,
      frequency: 12,
      frequencyType: 'months',
    },
  },
};
