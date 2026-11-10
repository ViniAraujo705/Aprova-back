import { Plan } from '@prisma/client';

/**
 * Promo de lançamento: toda agência criada de 10/11/2026 até o fim de
 * 30/11/2026 (horário de Brasília) já nasce no plano Agência (o mais
 * completo), sem cobrança. O plano fica na conta depois que a promo acaba —
 * só quem se cadastrar a partir de 01/12 volta a nascer no free.
 *
 * O front mostra a tela de boas-vindas da promo pra quem se cadastrou nessa
 * janela (ver components/launch-promo-celebration.tsx no AprovaWeb) — se
 * mudar as datas aqui, mude lá também.
 */
export const LAUNCH_PROMO = {
  plan: Plan.agencia,
  startsAt: new Date('2026-11-10T00:00:00-03:00'),
  endsAt: new Date('2026-12-01T00:00:00-03:00'),
} as const;

/** Plano com que uma agência nova nasce, considerando a promo de lançamento. */
export function initialPlanFor(now: Date = new Date()): Plan {
  return now >= LAUNCH_PROMO.startsAt && now < LAUNCH_PROMO.endsAt
    ? LAUNCH_PROMO.plan
    : Plan.free;
}
