import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ProcessamentoStatus,
  UserRole,
  UserStatus,
  VideoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { VideoProcessingService } from '../videos/processing/video-processing.service';

@Injectable()
export class AdminService {
  // Nao guardamos o tamanho real do arquivo (upload vai direto pro R2),
  // entao o storage e estimado por contagem de videos.
  private readonly ESTIMATED_BYTES_PER_VIDEO = 50 * 1024 * 1024; // ~50 MB

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoProcessing: VideoProcessingService,
  ) {}

  /**
   * Lista todas as agencias cadastradas (uma linha por vinculo owner<->
   * agencia - se a mesma pessoa for owner de 2 agencias, aparece 2x, uma
   * por agencia) com o tamanho de cada conta. `status` aqui e o banimento
   * global de plataforma (User.status, o mesmo que setUserStatus altera) -
   * nao a suspensao dentro de uma agencia especifica (Membership.status,
   * ver AccountService.setMemberStatus).
   */
  async listProfessionals() {
    const owners = await this.prisma.membership.findMany({
      where: { role: UserRole.owner },
      orderBy: { user: { criadoEm: 'desc' } },
      select: {
        user: {
          select: { id: true, nome: true, email: true, status: true, criadoEm: true },
        },
        account: {
          select: {
            id: true,
            nomeAgencia: true,
            _count: {
              select: { clients: true, projects: true, memberships: true },
            },
          },
        },
      },
    });
    // Mantem o nome de campo "users" na resposta (contrato ja consumido
    // pelo frontend) mesmo a contagem agora vindo da relacao memberships.
    return owners.map(({ user, account }) => ({
      ...user,
      account: {
        id: account.id,
        nomeAgencia: account.nomeAgencia,
        _count: {
          clients: account._count.clients,
          projects: account._count.projects,
          users: account._count.memberships,
        },
      },
    }));
  }

  /** Suspende ou reativa uma conta (banimento global de plataforma). */
  async setUserStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Usuario nao encontrado');
    }
    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, nome: true, email: true, status: true },
    });
  }

  /** Metricas gerais do sistema. */
  async getMetrics() {
    const [totalUsers, totalProfessionals, totalAdmins, totalVideos] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.membership.count({ where: { role: UserRole.owner } }),
        this.prisma.user.count({ where: { role: UserRole.admin } }),
        this.prisma.video.count(),
      ]);

    const videosByStatus = await this.prisma.video.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const statusMap = videosByStatus.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {},
    );

    // Falha de processamento (thumbnail/otimizacao) vive em statusProcessamento,
    // um campo separado do status de aprovacao (pendente/aprovado/ajuste/erro)
    // usado acima — nao confundir os dois.
    const videosByProcessamento = await this.prisma.video.groupBy({
      by: ['statusProcessamento'],
      _count: { _all: true },
    });

    const processamentoMap = videosByProcessamento.reduce<
      Record<string, number>
    >((acc, row) => {
      acc[row.statusProcessamento] = row._count._all;
      return acc;
    }, {});

    return {
      users: {
        total: totalUsers,
        profissionais: totalProfessionals,
        admins: totalAdmins,
        suspensos: await this.prisma.user.count({
          where: { status: UserStatus.suspenso },
        }),
      },
      videos: {
        total: totalVideos,
        porStatus: {
          pendente: statusMap[VideoStatus.pendente] ?? 0,
          aprovado: statusMap[VideoStatus.aprovado] ?? 0,
          ajuste: statusMap[VideoStatus.ajuste] ?? 0,
          erro: statusMap[VideoStatus.erro] ?? 0,
        },
        porProcessamento: {
          processando: processamentoMap[ProcessamentoStatus.processando] ?? 0,
          pronto: processamentoMap[ProcessamentoStatus.pronto] ?? 0,
          erro: processamentoMap[ProcessamentoStatus.erro] ?? 0,
        },
      },
      storage: {
        estimadoBytes: totalVideos * this.ESTIMATED_BYTES_PER_VIDEO,
        estimadoGb: Number(
          ((totalVideos * this.ESTIMATED_BYTES_PER_VIDEO) / 1024 ** 3).toFixed(
            2,
          ),
        ),
        observacao:
          'Estimativa por contagem (~50MB/video); tamanho real nao e armazenado.',
      },
    };
  }

  /**
   * Lista videos com falha de processamento (thumbnail/versao otimizada).
   * Falha de processamento fica em statusProcessamento, nao em status
   * (que e o workflow de aprovacao do cliente) — usar o campo errado aqui
   * fazia essa lista voltar sempre vazia mesmo com videos travados em erro.
   */
  async listErrorVideos() {
    const videos = await this.prisma.video.findMany({
      where: { statusProcessamento: ProcessamentoStatus.erro },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nomeArquivo: true,
        versao: true,
        status: true,
        statusProcessamento: true,
        criadoEm: true,
        project: {
          select: {
            id: true,
            nome: true,
            account: {
              select: {
                id: true,
                nomeAgencia: true,
                memberships: {
                  where: { role: UserRole.owner },
                  select: { user: { select: { id: true, nome: true, email: true } } },
                  orderBy: { criadoEm: 'asc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Mantem o formato "account.users[0]" (contrato ja consumido pelo
    // frontend) mesmo o owner agora vindo via Membership.
    return videos.map((video) => ({
      ...video,
      project: {
        ...video.project,
        account: {
          id: video.project.account.id,
          nomeAgencia: video.project.account.nomeAgencia,
          users: video.project.account.memberships.map((m) => m.user),
        },
      },
    }));
  }

  /**
   * Reenfileira o processamento (thumbnail + versao otimizada) de um video
   * travado em statusProcessamento = erro. Nao ha retry automatico apos os
   * 3 attempts do BullMQ se esgotarem, entao esse e o unico jeito de tentar
   * de novo sem o dono reenviar o arquivo.
   */
  async reprocessVideo(id: string) {
    const video = await this.prisma.video.findUnique({
      where: { id },
      select: { id: true, statusProcessamento: true },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    if (video.statusProcessamento !== ProcessamentoStatus.erro) {
      throw new ConflictException(
        'Video nao esta em erro de processamento (statusProcessamento atual: ' +
          `${video.statusProcessamento})`,
      );
    }

    await this.prisma.video.update({
      where: { id },
      data: { statusProcessamento: ProcessamentoStatus.processando },
    });
    await this.videoProcessing.enqueue('video', id);

    return { id, statusProcessamento: ProcessamentoStatus.processando };
  }
}
