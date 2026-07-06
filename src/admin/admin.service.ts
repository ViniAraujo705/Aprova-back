import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, UserStatus, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  // Nao guardamos o tamanho real do arquivo (upload vai direto pro R2),
  // entao o storage e estimado por contagem de videos.
  private readonly ESTIMATED_BYTES_PER_VIDEO = 50 * 1024 * 1024; // ~50 MB

  constructor(private readonly prisma: PrismaService) {}

  /** Lista todas as agencias (owners) cadastradas com o tamanho da conta. */
  listProfessionals() {
    return this.prisma.user.findMany({
      where: { role: UserRole.owner },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nome: true,
        email: true,
        status: true,
        criadoEm: true,
        account: {
          select: {
            id: true,
            nomeAgencia: true,
            _count: {
              select: { clients: true, projects: true, users: true },
            },
          },
        },
      },
    });
  }

  /** Suspende ou reativa uma conta. */
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
        this.prisma.user.count({ where: { role: UserRole.owner } }),
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
      },
      storage: {
        estimadoBytes: totalVideos * this.ESTIMATED_BYTES_PER_VIDEO,
        estimadoGb: Number(
          (
            (totalVideos * this.ESTIMATED_BYTES_PER_VIDEO) /
            1024 ** 3
          ).toFixed(2),
        ),
        observacao:
          'Estimativa por contagem (~50MB/video); tamanho real nao e armazenado.',
      },
    };
  }

  /** Lista videos com falha de upload / erro. */
  listErrorVideos() {
    return this.prisma.video.findMany({
      where: { status: VideoStatus.erro },
      orderBy: { criadoEm: 'desc' },
      select: {
        id: true,
        nomeArquivo: true,
        versao: true,
        status: true,
        criadoEm: true,
        project: {
          select: {
            id: true,
            nome: true,
            account: {
              select: {
                id: true,
                nomeAgencia: true,
                users: {
                  where: { role: UserRole.owner },
                  select: { id: true, nome: true, email: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
  }
}
