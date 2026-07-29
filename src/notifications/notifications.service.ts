import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

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

      const owners = await this.prisma.user.findMany({
        where: { accountId: video.project.accountId, role: UserRole.owner },
        select: { id: true },
      });

      const recipientIds = new Set(owners.map((o) => o.id));
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

  list(user: AuthUser, apenasNaoLidas?: boolean) {
    return this.prisma.notification.findMany({
      where: {
        userId: user.id,
        accountId: user.accountId,
        ...(apenasNaoLidas ? { lida: false } : {}),
      },
      orderBy: { criadoEm: 'desc' },
      take: 50,
      select: NOTIFICATION_SELECT,
    });
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
}
