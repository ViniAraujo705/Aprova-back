import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InviteStatus, Plan, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, PlanLimits } from './plan-limits.config';

export type PlanFeature =
  'whiteLabel' | 'pdfReports' | 'priorityQueue' | 'teamPerformance';

const FEATURE_LABELS: Record<PlanFeature, string> = {
  whiteLabel: 'marca propria (white-label)',
  pdfReports: 'relatorios em PDF',
  priorityQueue: 'prioridade na fila de processamento',
  teamPerformance: 'desempenho da equipe',
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
    const plan = await this.getPlan(accountId);
    const usage = await this.getUsage(accountId);
    return { plan, limits: this.limitsFor(plan), usage };
  }

  async getUsage(accountId: string) {
    const [clients, extraEditors, videosThisMonth, ratingQuestions] =
      await Promise.all([
        this.prisma.client.count({ where: { accountId } }),
        this.countExtraEditors(accountId),
        this.countVideosThisMonth(accountId),
        this.prisma.ratingQuestion.count({ where: { accountId } }),
      ]);
    return { clients, extraEditors, videosThisMonth, ratingQuestions };
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
    const { maxExtraEditors } = this.limitsFor(plan);
    const count = await this.countExtraEditors(accountId);
    if (count >= maxExtraEditors) {
      throw new ForbiddenException(
        maxExtraEditors === 0
          ? `O plano ${plan} nao permite convidar editores. Faca upgrade para o plano Agencia.`
          : `Limite de ${maxExtraEditors} editores do plano ${plan} atingido. Faca upgrade para convidar mais.`,
      );
    }
  }

  async assertCanCreateVideo(accountId: string): Promise<void> {
    const plan = await this.getPlan(accountId);
    const { maxVideosPerMonth } = this.limitsFor(plan);
    if (maxVideosPerMonth === null) return;

    const count = await this.countVideosThisMonth(accountId);
    if (count >= maxVideosPerMonth) {
      throw new ForbiddenException(
        `Limite de ${maxVideosPerMonth} videos no mes do plano ${plan} atingido. Faca upgrade para enviar mais videos.`,
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

  async assertFeature(accountId: string, feature: PlanFeature): Promise<void> {
    const plan = await this.getPlan(accountId);
    if (!this.limitsFor(plan)[feature]) {
      throw new ForbiddenException(
        `Recurso "${FEATURE_LABELS[feature]}" nao esta disponivel no plano ${plan}. Faca upgrade para usar.`,
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

  /** Editores ativos + convites pendentes (owners nao contam no limite). */
  private async countExtraEditors(accountId: string): Promise<number> {
    const [activeEditors, pendingInvites] = await Promise.all([
      this.prisma.membership.count({
        where: { accountId, role: UserRole.editor },
      }),
      this.prisma.invite.count({
        where: { accountId, status: InviteStatus.pendente },
      }),
    ]);
    return activeEditors + pendingInvites;
  }

  private countVideosThisMonth(accountId: string): Promise<number> {
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
