import { Plan } from '@prisma/client';

export interface PlanLimits {
  // null = ilimitado
  maxClients: number | null;
  maxVideosPerMonth: number | null;
  maxRatingQuestions: number | null;
  // Editores alem do(s) owner(s) da conta (convites pendentes contam).
  maxExtraEditors: number;
  whiteLabel: boolean;
  pdfReports: boolean;
  priorityQueue: boolean;
  // Apenas informativo (exibido em GET /plans/me): nao ha enforcement, pois
  // o tamanho do arquivo de video nao e persistido hoje (ver PlansService).
  storageGb: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxClients: 3,
    maxVideosPerMonth: 8,
    maxRatingQuestions: 3,
    maxExtraEditors: 0,
    whiteLabel: false,
    pdfReports: false,
    priorityQueue: false,
    storageGb: 5,
  },
  pro: {
    maxClients: null,
    maxVideosPerMonth: null,
    maxRatingQuestions: null,
    maxExtraEditors: 0,
    whiteLabel: true,
    pdfReports: true,
    priorityQueue: false,
    storageGb: 50,
  },
  agencia: {
    maxClients: null,
    maxVideosPerMonth: null,
    maxRatingQuestions: null,
    maxExtraEditors: 5,
    whiteLabel: true,
    pdfReports: true,
    priorityQueue: true,
    storageGb: 100,
  },
};
