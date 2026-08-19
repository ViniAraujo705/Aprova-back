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
   * Desempenho por editor com pelo menos 1 video atribuido. Cada video conta
   * integralmente para cada pessoa responsavel (nao e dividido): o indicador
   * mede participacao e qualidade, e nao rateio de esforco. notaMedia e a
   * media da nota_geral (1-5, dada pelo cliente na aprovacao), normalizada
   * para escala 0-10 (x2). videosAprovadosCount inclui aprovados sem nota.
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

    const atribuicoes = await this.prisma.videoResponsavel.findMany({
      where: { userId: { in: editorIds } },
      select: {
        userId: true,
        video: { select: { status: true, notaGeral: true } },
      },
    });

    const statsPorEditor = new Map<
      string,
      { atribuicoes: number; aprovados: number; somaNotas: number; notas: number }
    >();
    for (const { userId, video } of atribuicoes) {
      const stats = statsPorEditor.get(userId) ?? {
        atribuicoes: 0,
        aprovados: 0,
        somaNotas: 0,
        notas: 0,
      };
      stats.atribuicoes += 1;
      if (video.status === VideoStatus.aprovado) {
        stats.aprovados += 1;
        if (video.notaGeral !== null) {
          stats.somaNotas += video.notaGeral;
          stats.notas += 1;
        }
      }
      statsPorEditor.set(userId, stats);
    }

    return editores
      .filter((e) => statsPorEditor.has(e.id))
      .map((e) => {
        const stats = statsPorEditor.get(e.id)!;
        const mediaBruta =
          stats.notas > 0 ? stats.somaNotas / stats.notas : null;
        const notaMedia =
          mediaBruta !== null ? Number((mediaBruta * 2).toFixed(1)) : null;
        return {
          editorId: e.id,
          nome: e.nome,
          // Nao ha upload de avatar de usuario no backend hoje; placeholder
          // para uma futura feature de foto de perfil.
          avatarUrl: null,
          notaMedia,
          videosAprovadosCount: stats.aprovados,
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
