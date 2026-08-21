import { Plan } from '@prisma/client';

// Nivel de acesso a um recurso: "none" = indisponivel, "basic"/"complete" (ou
// "basic"/"advanced" em reports) = graus de profundidade dentro do recurso.
// Hoje so "none" e efetivamente checado no backend (PlansService.
// assertLevelFeature) - a diferenca entre basic/complete/advanced e so
// informativa pra UI, pois o produto ainda nao bifurca o comportamento por
// nivel.
export type FeatureLevel = 'none' | 'basic' | 'complete';
export type ReportsLevel = 'none' | 'basic' | 'advanced';

export interface PlanLimits {
  // null = ilimitado
  maxClients: number | null;
  // Membros totais da conta, incluindo owner(s) (ver PlansService.
  // countTeamMembers) - substituiu o antigo maxExtraEditors (que so contava
  // editores, owner de fora).
  maxTeamMembers: number | null;
  // Videos + arquivos enviados pra aprovacao no mes corrente.
  maxApprovalFilesPerMonth: number | null;
  // Itens (PortfolioVideo) somados em todos os portfolios da conta.
  maxPortfolioProjects: number | null;
  maxRatingQuestions: number | null;
  // Apenas informativo (exibido em GET /plans/me): nao ha enforcement, pois
  // o tamanho do arquivo de video nao e persistido hoje (ver PlansService).
  storageGb: number;

  publicPortfolio: boolean;
  changeRequests: boolean;
  clientApproval: boolean;
  recordingManagement: FeatureLevel;
  deliveryManagement: FeatureLevel;
  contentCalendar: boolean;
  clientArea: FeatureLevel;
  publishContent: boolean;
  reports: ReportsLevel;
  teamPerformance: boolean;
  priorityProcessing: boolean;
  prioritySupport: boolean;
  whiteLabel: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  portfolio: {
    maxClients: 0,
    maxTeamMembers: 0,
    maxApprovalFilesPerMonth: 0,
    maxPortfolioProjects: null,
    maxRatingQuestions: 0,
    storageGb: 10,
    publicPortfolio: true,
    changeRequests: false,
    clientApproval: false,
    recordingManagement: 'none',
    deliveryManagement: 'none',
    contentCalendar: false,
    clientArea: 'none',
    publishContent: false,
    reports: 'none',
    teamPerformance: false,
    priorityProcessing: false,
    prioritySupport: false,
    whiteLabel: false,
  },
  free: {
    maxClients: 1,
    maxTeamMembers: 1,
    maxApprovalFilesPerMonth: 10,
    maxPortfolioProjects: 6,
    maxRatingQuestions: 3,
    storageGb: 5,
    publicPortfolio: true,
    changeRequests: true,
    clientApproval: true,
    recordingManagement: 'basic',
    deliveryManagement: 'basic',
    contentCalendar: false,
    clientArea: 'basic',
    publishContent: false,
    reports: 'none',
    teamPerformance: false,
    priorityProcessing: false,
    prioritySupport: false,
    whiteLabel: false,
  },
  pro: {
    maxClients: 8,
    maxTeamMembers: 3,
    maxApprovalFilesPerMonth: 100,
    maxPortfolioProjects: null,
    maxRatingQuestions: null,
    storageGb: 100,
    publicPortfolio: true,
    changeRequests: true,
    clientApproval: true,
    recordingManagement: 'complete',
    deliveryManagement: 'complete',
    contentCalendar: true,
    clientArea: 'complete',
    publishContent: true,
    reports: 'basic',
    teamPerformance: false,
    priorityProcessing: false,
    prioritySupport: false,
    whiteLabel: true,
  },
  agencia: {
    maxClients: 30,
    maxTeamMembers: 8,
    maxApprovalFilesPerMonth: 500,
    maxPortfolioProjects: null,
    maxRatingQuestions: null,
    storageGb: 500,
    publicPortfolio: true,
    changeRequests: true,
    clientApproval: true,
    recordingManagement: 'complete',
    deliveryManagement: 'complete',
    contentCalendar: true,
    clientArea: 'complete',
    publishContent: true,
    reports: 'advanced',
    teamPerformance: true,
    priorityProcessing: true,
    prioritySupport: true,
    whiteLabel: true,
  },
};
