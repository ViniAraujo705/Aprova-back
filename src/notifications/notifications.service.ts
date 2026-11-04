import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CommentChannel,
  EtapaProducao,
  NotificationType,
  Prisma,
  UserRole,
  VideoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

// Janela de antecedencia do lembrete de gravacao: evento entra na consulta
// assim que faltar <= 24h pro inicio (ver sendRecordingReminders).
const RECORDING_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
// "Prazo proximo" avisa quando faltam <= 24h; "prazo vencido" so olha o que
// venceu nas ultimas 24h, para o primeiro deploy nao despejar avisos de
// prazos esquecidos ha meses.
const DEADLINE_WINDOW_MS = 24 * HOUR_MS;
// Video sem resposta do cliente ha 3 dias vira pendencia. Teto de 10 dias
// pelo mesmo motivo acima.
const AGUARDANDO_CLIENTE_MS = 3 * 24 * HOUR_MS;
const AGUARDANDO_CLIENTE_TETO_MS = 10 * 24 * HOUR_MS;
// Etapas em que prazo nao importa mais.
const ETAPAS_CONCLUIDAS = [EtapaProducao.aprovado, EtapaProducao.entregue];

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
  demanda: {
    select: {
      id: true,
      titulo: true,
      prazo: true,
      cliente: { select: { nome: true } },
    },
  },
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria a notificacao para os owners da conta + todas as pessoas responsaveis
   * pelo video. Chamado internamente pelos fluxos publicos do
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
          responsaveis: { select: { userId: true } },
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
      for (const responsavel of video.responsaveis) {
        recipientIds.add(responsavel.userId);
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
    return notifications.map(({ recordingEvent, demanda, ...rest }) => ({
      ...rest,
      ...(demanda
        ? {
            demanda: {
              id: demanda.id,
              titulo: demanda.titulo,
              prazo: demanda.prazo,
              clienteNome: demanda.cliente?.nome ?? null,
            },
          }
        : {}),
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
   * Aviso manual para a equipe vinculada a um RecordingEvent. O indice unico
   * de lembretes torna o botao idempotente e evita repetir o aviso que o
   * cron possa ter criado antes.
   */
  async notifyRecordingEvent(
    accountId: string,
    recordingEventId: string,
    userIds: string[],
  ): Promise<number> {
    const recipientIds = [...new Set(userIds)];
    if (recipientIds.length === 0) return 0;

    const result = await this.prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        accountId,
        userId,
        recordingEventId,
        type: NotificationType.lembrete_gravacao,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /**
   * Cron: lembra de uma gravacao (RecordingEvent) que comeca em ate 24h.
   * Destinatarios: todo owner da conta (sempre) + o membro responsavel do
   * evento + cada CrewMember escalado que tenha userId. Freelancers sem
   * conta (userId null) nao recebem nada, nao ha pra quem notificar.
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
          membroId: true,
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
          ...(event.membroId ? [event.membroId] : []),
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

  /**
   * Avisa quem foi colocado numa demanda (responsavel + colaboradores), menos
   * quem fez a acao. A chave por demanda garante um aviso so por pessoa,
   * mesmo que ela seja tirada e colocada de novo.
   */
  async notifyDemanda(
    accountId: string,
    demandaId: string,
    userIds: (string | null | undefined)[],
    autorId: string,
  ): Promise<void> {
    try {
      const recipientIds = [
        ...new Set(userIds.filter((id): id is string => !!id)),
      ].filter((id) => id !== autorId);
      if (recipientIds.length === 0) return;
      await this.prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          accountId,
          userId,
          demandaId,
          type: NotificationType.nova_demanda,
          chave: `nova_demanda:${demandaId}`,
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao notificar demanda ${demandaId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Cron: prazos (videos e demandas) vencendo nas proximas 24h ou que
   * acabaram de vencer, e videos esperando o cliente ha 3 dias. Cada aviso
   * tem uma `chave` unica por pessoa (o prazo entra na chave: se o prazo
   * mudar, a pessoa e avisada de novo do prazo novo), entao rodar a cada
   * 10min ou em duas replicas ao mesmo tempo nao duplica nada.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendDeadlineAlerts(): Promise<void> {
    try {
      const now = Date.now();
      await this.alertVideoDeadlines(
        NotificationType.prazo_proximo,
        new Date(now),
        new Date(now + DEADLINE_WINDOW_MS),
      );
      await this.alertVideoDeadlines(
        NotificationType.prazo_vencido,
        new Date(now - DEADLINE_WINDOW_MS),
        new Date(now),
      );
      await this.alertDemandaDeadlines(
        NotificationType.prazo_proximo,
        new Date(now),
        new Date(now + DEADLINE_WINDOW_MS),
      );
      await this.alertDemandaDeadlines(
        NotificationType.prazo_vencido,
        new Date(now - DEADLINE_WINDOW_MS),
        new Date(now),
      );
      await this.alertAguardandoCliente(now);
    } catch (err) {
      this.logger.error(
        'Falha ao gerar avisos de prazo/pendencia',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // Versao atual (sem versao filha), ainda em aberto e com arquivo.
  private static readonly VIDEO_EM_ABERTO: Prisma.VideoWhereInput = {
    isExemplo: false,
    status: { not: VideoStatus.aprovado },
    etapaProducao: { notIn: ETAPAS_CONCLUIDAS },
    arquivoRemovidoEm: null,
    versoes: { none: {} },
  };

  private async alertVideoDeadlines(
    type: NotificationType,
    from: Date,
    to: Date,
  ): Promise<void> {
    const videos = await this.prisma.video.findMany({
      where: {
        ...NotificationsService.VIDEO_EM_ABERTO,
        deadline: { gt: from, lte: to },
      },
      select: {
        id: true,
        deadline: true,
        responsaveis: { select: { userId: true } },
        project: { select: { accountId: true } },
      },
    });
    for (const video of videos) {
      const owners = await this.ownerIds(video.project.accountId);
      await this.prisma.notification.createMany({
        data: [
          ...new Set([...owners, ...video.responsaveis.map((r) => r.userId)]),
        ].map((userId) => ({
          accountId: video.project.accountId,
          userId,
          videoId: video.id,
          type,
          chave: `${type}:video:${video.id}:${video.deadline!.toISOString()}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async alertDemandaDeadlines(
    type: NotificationType,
    from: Date,
    to: Date,
  ): Promise<void> {
    const demandas = await this.prisma.demanda.findMany({
      where: {
        prazo: { gt: from, lte: to },
        etapa: { notIn: ETAPAS_CONCLUIDAS },
      },
      select: {
        id: true,
        accountId: true,
        prazo: true,
        responsavelId: true,
        collaborators: { select: { userId: true } },
      },
    });
    for (const demanda of demandas) {
      const owners = await this.ownerIds(demanda.accountId);
      const recipientIds = new Set([
        ...owners,
        ...(demanda.responsavelId ? [demanda.responsavelId] : []),
        ...demanda.collaborators.map((c) => c.userId),
      ]);
      await this.prisma.notification.createMany({
        data: [...recipientIds].map((userId) => ({
          accountId: demanda.accountId,
          userId,
          demandaId: demanda.id,
          type,
          chave: `${type}:demanda:${demanda.id}:${demanda.prazo!.toISOString()}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async alertAguardandoCliente(now: number): Promise<void> {
    const limite = new Date(now - AGUARDANDO_CLIENTE_MS);
    const videos = await this.prisma.video.findMany({
      where: {
        ...NotificationsService.VIDEO_EM_ABERTO,
        status: VideoStatus.pendente,
        criadoEm: {
          lte: limite,
          gt: new Date(now - AGUARDANDO_CLIENTE_TETO_MS),
        },
        // Cliente que comentou nos ultimos 3 dias esta acompanhando.
        comments: {
          none: { channel: CommentChannel.cliente, criadoEm: { gt: limite } },
        },
      },
      select: {
        id: true,
        responsaveis: { select: { userId: true } },
        project: { select: { accountId: true } },
      },
    });
    for (const video of videos) {
      const owners = await this.ownerIds(video.project.accountId);
      await this.prisma.notification.createMany({
        data: [
          ...new Set([...owners, ...video.responsaveis.map((r) => r.userId)]),
        ].map((userId) => ({
          accountId: video.project.accountId,
          userId,
          videoId: video.id,
          type: NotificationType.aguardando_cliente,
          chave: `aguardando_cliente:${video.id}`,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async ownerIds(accountId: string): Promise<string[]> {
    const owners = await this.prisma.membership.findMany({
      where: { accountId, role: UserRole.owner },
      select: { userId: true },
    });
    return owners.map((o) => o.userId);
  }

  async getPreferences(user: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        emailResumoDiario: true,
        emailImediato: true,
        emailTiposDesligados: true,
      },
    });
  }

  async updatePreferences(
    user: AuthUser,
    dto: {
      emailResumoDiario?: boolean;
      emailImediato?: boolean;
      emailTiposDesligados?: NotificationType[];
    },
  ) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.emailResumoDiario !== undefined
          ? { emailResumoDiario: dto.emailResumoDiario }
          : {}),
        ...(dto.emailImediato !== undefined
          ? { emailImediato: dto.emailImediato }
          : {}),
        ...(dto.emailTiposDesligados !== undefined
          ? { emailTiposDesligados: [...new Set(dto.emailTiposDesligados)] }
          : {}),
      },
      select: {
        emailResumoDiario: true,
        emailImediato: true,
        emailTiposDesligados: true,
      },
    });
  }
}
