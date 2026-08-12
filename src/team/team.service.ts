import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Faixa = 'verde' | 'amarelo' | 'laranja' | 'vermelho' | 'sem_dados';

export interface EditorPerformance {
  editorId: string;
  nome: string;
  avatarUrl: string | null;
  notaMedia: number | null;
  videosAprovadosCount: number;
  faixa: Faixa;
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Desempenho por editor (owner + editores com pelo menos 1 video
   * atribuido). notaMedia e a media da nota_geral (1-5, dada pelo cliente
   * na aprovacao) dos videos aprovados atribuidos ao editor, normalizada
   * para escala 0-10 (x2). videosAprovadosCount conta todos os videos
   * aprovados atribuidos, tenham nota ou nao.
   */
  async getPerformance(accountId: string): Promise<EditorPerformance[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { accountId, role: UserRole.editor, status: UserStatus.ativo },
      select: { user: { select: { id: true, nome: true } } },
    });
    const editores = memberships.map((m) => m.user);
    if (editores.length === 0) {
      return [];
    }
    const editorIds = editores.map((e) => e.id);

    const [atribuidos, aprovados] = await Promise.all([
      this.prisma.video.groupBy({
        by: ['editorResponsavelId'],
        where: { editorResponsavelId: { in: editorIds } },
        _count: { _all: true },
      }),
      this.prisma.video.groupBy({
        by: ['editorResponsavelId'],
        where: {
          editorResponsavelId: { in: editorIds },
          status: VideoStatus.aprovado,
        },
        _count: { _all: true },
        _avg: { notaGeral: true },
      }),
    ]);

    const comAtribuicao = new Set(atribuidos.map((a) => a.editorResponsavelId));
    const aprovadosPorEditor = new Map(
      aprovados.map((a) => [a.editorResponsavelId, a]),
    );

    return editores
      .filter((e) => comAtribuicao.has(e.id))
      .map((e) => {
        const stats = aprovadosPorEditor.get(e.id);
        const mediaBruta = stats?._avg.notaGeral ?? null;
        const notaMedia =
          mediaBruta !== null ? Number((mediaBruta * 2).toFixed(1)) : null;
        return {
          editorId: e.id,
          nome: e.nome,
          // Nao ha upload de avatar de usuario no backend hoje; placeholder
          // para uma futura feature de foto de perfil.
          avatarUrl: null,
          notaMedia,
          videosAprovadosCount: stats?._count._all ?? 0,
          faixa: this.faixaFor(notaMedia),
        };
      });
  }

  private faixaFor(notaMedia: number | null): Faixa {
    if (notaMedia === null) return 'sem_dados';
    if (notaMedia >= 8) return 'verde';
    if (notaMedia >= 6) return 'amarelo';
    if (notaMedia >= 4) return 'laranja';
    return 'vermelho';
  }
}
