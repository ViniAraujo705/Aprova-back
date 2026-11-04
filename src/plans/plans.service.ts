import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, PlanLimits } from './plan-limits.config';

export type PlanFeature =
  | 'whiteLabel'
  | 'teamPerformance'
  | 'priorityProcessing'
  | 'prioritySupport'
  | 'publicPortfolio'
  | 'changeRequests'
  | 'clientApproval'
  | 'contentCalendar'
  | 'publishContent';

export type PlanLevelFeature =
  'recordingManagement' | 'deliveryManagement' | 'clientArea' | 'reports';

const FEATURE_LABELS: Record<PlanFeature, string> = {
  whiteLabel: 'marca propria (white-label)',
  teamPerformance: 'desempenho da equipe',
  priorityProcessing: 'prioridade na fila de processamento',
  prioritySupport: 'suporte prioritario',
  publicPortfolio: 'portfolio publico',
  changeRequests: 'solicitacao de alteracoes',
  clientApproval: 'aprovacao pelo cliente',
  contentCalendar: 'calendario de conteudo',
  publishContent: 'disponibilizar conteudo para postagem',
};

const LEVEL_FEATURE_LABELS: Record<PlanLevelFeature, string> = {
  recordingManagement: 'gestao de gravacoes',
  deliveryManagement: 'gestao de entregas',
  clientArea: 'area do cliente',
  reports: 'relatorios',
};

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  limitsFor(plan: Plan): PlanLimits {
    return PLAN_LIMITS[plan];
  }

  async getPlan(accountId: string): Promise<Plan> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { plan: true },
    });
    return account.plan;
  }

  async getPlanInfo(accountId: string) {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        plan: true,
        asaasPlan: true,
        asaasCycle: true,
        asaasSubscriptionId: true,
      },
    });
    const usage = await this.getUsage(accountId);
    const plan = account.plan;
    return {
      plan,
      limits: this.limitsFor(plan),
      usage,
      // Estado da cobranca, separado do plano em vigor. `suspensa` distingue
      // "voltou pro free porque cancelou" de "voltou pro free porque a
      // cobranca venceu" — sem isso o cliente perde acesso sem entender.
      assinatura: {
        planoContratado: account.asaasPlan,
        ciclo: account.asaasCycle,
        ativa: account.asaasSubscriptionId !== null,
        suspensa: account.asaasPlan !== null && plan === Plan.free,
      },
    };
  }

  async getUsage(accountId: string) {
    const [
      clients,
      teamMembers,
      approvalFilesThisMonth,
      portfolioProjects,
      ratingQuestions,
    ] = await Promise.all([
      this.prisma.client.count({ where: { accountId } }),
      this.countTeamMembers(accountId),
      this.countApprovalFilesThisMonth(accountId),
      this.prisma.portfolioVideo.count({
        where: { portfolio: { accountId } },
      }),
      this.prisma.ratingQuestion.count({ where: { accountId } }),
    ]);
    return {
      clients,
      teamMembers,
      approvalFilesThisMonth,
      portfolioProjects,
      ratingQuestions,
    };
  }

  async assertCanAddClient(accountId: string): Promise<void> {
    const plan = await this.getPlan(accountId);
    const { maxClients } = this.limitsFor(plan);
    if (maxClients === null) return;

    const count = await this.prisma.client.count({ where: { accountId } });
    if (count >= maxClients) {
      throw new ForbiddenException(
        `Limite de ${maxClients} clientes do plano ${plan} atingido. Faca upgrade para adicionar mais clientes.`,
      );
    }
  }

  async assertCanInviteEditor(accountId: string): Promise<void> {
    const plan = await this.getPlan(accountId);
    const { maxTeamMembers } = this.limitsFor(plan);
    if (maxTeamMembers === null) return;

    const count = await this.countTeamMembers(accountId);
    if (count >= maxTeamMembers) {
      throw new ForbiddenException(
        `Limite de ${maxTeamMembers} membros do plano ${plan} atingido. Faca upgrade para convidar mais.`,
      );
    }
  }

  async assertCanCreateVideo(accountId: string): Promise<void> {
    const plan = await this.getPlan(accountId);
    const { maxApprovalFilesPerMonth } = this.limitsFor(plan);
    if (maxApprovalFilesPerMonth === null) return;

    const count = await this.countApprovalFilesThisMonth(accountId);
    if (count >= maxApprovalFilesPerMonth) {
      throw new ForbiddenException(
        `Limite de ${maxApprovalFilesPerMonth} videos/arquivos no mes do plano ${plan} atingido. Faca upgrade para enviar mais.`,
      );
    }
  }

  async assertCanAddRatingQuestion(accountId: string): Promise<void> {
    const plan = await this.getPlan(accountId);
    const { maxRatingQuestions } = this.limitsFor(plan);
    if (maxRatingQuestions === null) return;

    const count = await this.prisma.ratingQuestion.count({
      where: { accountId },
    });
    if (count >= maxRatingQuestions) {
      throw new ForbiddenException(
        `Limite de ${maxRatingQuestions} perguntas de avaliacao do plano ${plan} atingido. Faca upgrade para criar mais.`,
      );
    }
  }

  async assertCanAddPortfolioProject(accountId: string): Promise<void> {
    const plan = await this.getPlan(accountId);
    const { maxPortfolioProjects } = this.limitsFor(plan);
    if (maxPortfolioProjects === null) return;

    const count = await this.prisma.portfolioVideo.count({
      where: { portfolio: { accountId } },
    });
    if (count >= maxPortfolioProjects) {
      throw new ForbiddenException(
        `Limite de ${maxPortfolioProjects} projetos no portfolio do plano ${plan} atingido. Faca upgrade para adicionar mais.`,
      );
    }
  }

  async assertFeature(accountId: string, feature: PlanFeature): Promise<void> {
    const plan = await this.getPlan(accountId);
    if (!this.limitsFor(plan)[feature]) {
      throw new ForbiddenException(
        `Recurso "${FEATURE_LABELS[feature]}" nao esta disponivel no plano ${plan}. Faca upgrade para usar.`,
      );
    }
  }

  /** Bloqueia apenas quando o nivel do recurso for "none" no plano. */
  async assertLevelFeature(
    accountId: string,
    feature: PlanLevelFeature,
  ): Promise<void> {
    const plan = await this.getPlan(accountId);
    const level = this.limitsFor(plan)[feature];
    if (level === 'none') {
      throw new ForbiddenException(
        `Recurso "${LEVEL_FEATURE_LABELS[feature]}" nao esta disponivel no plano ${plan}. Faca upgrade para usar.`,
      );
    }
  }

  /** Troca manual do plano (nao ha gateway de pagamento integrado ainda). */
  async setPlan(accountId: string, plan: Plan) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('Conta nao encontrada');
    }
    return this.prisma.account.update({
      where: { id: accountId },
      data: { plan },
      select: { id: true, nomeAgencia: true, plan: true },
    });
  }

  /** Membros ativos (qualquer role, inclui owner) + convites pendentes. */
  private async countTeamMembers(accountId: string): Promise<number> {
    const [members, pendingInvites] = await Promise.all([
      this.prisma.membership.count({ where: { accountId } }),
      this.prisma.invite.count({
        where: { accountId, status: InviteStatus.pendente },
      }),
    ]);
    return members + pendingInvites;
  }

  private countApprovalFilesThisMonth(accountId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    return this.prisma.video.count({
      where: {
        project: { accountId },
        criadoEm: { gte: startOfMonth },
      },
    });
  }
}
