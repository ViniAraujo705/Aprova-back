import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

// Janela de antecedencia do lembrete de gravacao: evento entra na consulta
// assim que faltar <= 24h pro inicio (ver sendRecordingReminders).
const RECORDING_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

// Campos retornados em toda listagem de notificacao: contexto suficiente
// para o frontend renderizar e linkar sem precisar de uma segunda chamada.
const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  lida: true,
  criadoEm: true,
  video: {
    select: {
      id: true,
      nomeArquivo: true,
      thumbnailUrl: true,
      linkPublico: true,
      project: {
        select: {
          nome: true,
          client: { select: { nome: true } },
        },
      },
    },
  },
  recordingEvent: {
    select: {
      id: true,
      titulo: true,
      dataInicio: true,
      cliente: { select: { nome: true } },
    },
  },
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a notificacao para os owners da conta + o editor responsavel pelo
   * video (se houver). Chamado internamente pelos fluxos publicos do
   * cliente (comentario, aprovacao, ajuste, avaliacao) - nunca exposto via
   * controller.
   *
   * Best-effort: e sempre chamado depois que a acao principal (comentario,
   * rating, aprovacao) ja foi persistida. Uma falha aqui (ex: tabela de
   * notificacoes fora do ar) nunca pode derrubar a resposta de uma acao
   * que ja aconteceu - por isso engole e loga o erro em vez de propagar.
   */
  async notify(videoId: string, type: NotificationType): Promise<void> {
    try {
      const video = await this.prisma.video.findUnique({
        where: { id: videoId },
        select: {
          editorResponsavelId: true,
          project: { select: { accountId: true } },
        },
      });
      if (!video) {
        return;
      }

      const owners = await this.prisma.membership.findMany({
        where: { accountId: video.project.accountId, role: UserRole.owner },
        select: { userId: true },
      });

      const recipientIds = new Set(owners.map((o) => o.userId));
      if (video.editorResponsavelId) {
        recipientIds.add(video.editorResponsavelId);
      }
      if (recipientIds.size === 0) {
        return;
      }

      await this.prisma.notification.createMany({
        data: [...recipientIds].map((userId) => ({
          accountId: video.project.accountId,
          userId,
          videoId,
          type,
        })),
      });
    } catch (err) {
      this.logger.error(
        `Falha ao criar notificacao (videoId=${videoId}, type=${type})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async list(user: AuthUser, apenasNaoLidas?: boolean) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId: user.id,
        accountId: user.accountId,
        ...(apenasNaoLidas ? { lida: false } : {}),
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      select: NOTIFICATION_SELECT,
    });
    return notifications.map(({ recordingEvent, ...rest }) => ({
      ...rest,
      ...(recordingEvent
        ? {
            event: {
              id: recordingEvent.id,
              title: recordingEvent.titulo,
              startAt: recordingEvent.dataInicio,
              clientName: recordingEvent.cliente?.nome ?? null,
            },
          }
        : {}),
    }));
  }

  unreadCount(user: AuthUser) {
    return this.prisma.notification.count({
      where: { userId: user.id, accountId: user.accountId, lida: false },
    });
  }

  async markRead(user: AuthUser, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { lida: true },
    });
  }

  async markAllRead(user: AuthUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, accountId: user.accountId, lida: false },
      data: { lida: true },
    });
  }

  /**
   * Cron: lembra de uma gravacao (RecordingEvent) que comeca em ate 24h.
   * Destinatarios: todo owner da conta (sempre) + cada CrewMember escalado
   * no evento que tenha userId (a pessoa vinculada a uma conta real, seja
   * owner ou editor) - freelancers sem conta (userId null) nao recebem
   * nada, nao ha pra quem notificar.
   *
   * Nao filtra eventos que ja tem alguma notificacao (ao contrario da
   * versao anterior): a equipe pode ganhar gente nova (POST/PATCH
   * equipeIds) depois que os owners ja foram notificados, e essa pessoa
   * ainda precisa receber o lembrete quando a janela de 24h chegar. O
   * unique index (recording_event_id, user_id, type) + skipDuplicates
   * garantem que ninguem seja notificado duas vezes pelo mesmo evento,
   * mesmo com essa query rodando a cada 10min e entre replicas/execucoes
   * concorrentes do cron.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendRecordingReminders(): Promise<void> {
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + RECORDING_REMINDER_WINDOW_MS);

      const events = await this.prisma.recordingEvent.findMany({
        where: { dataInicio: { gt: now, lte: windowEnd } },
        select: {
          id: true,
          accountId: true,
          equipe: { select: { crewMember: { select: { userId: true } } } },
        },
      });
      if (events.length === 0) {
        return;
      }

      for (const event of events) {
        const owners = await this.prisma.membership.findMany({
          where: { accountId: event.accountId, role: UserRole.owner },
          select: { userId: true },
        });
        const crewUserIds = event.equipe
          .map((e) => e.crewMember.userId)
          .filter((userId): userId is string => userId !== null);

        const recipientIds = new Set([
          ...owners.map((owner) => owner.userId),
          ...crewUserIds,
        ]);
        if (recipientIds.size === 0) {
          continue;
        }

        await this.prisma.notification.createMany({
          data: [...recipientIds].map((userId) => ({
            accountId: event.accountId,
            userId,
            recordingEventId: event.id,
            type: NotificationType.lembrete_gravacao,
          })),
          skipDuplicates: true,
        });
      }
    } catch (err) {
      this.logger.error(
        'Falha ao enviar lembretes de gravacao',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
