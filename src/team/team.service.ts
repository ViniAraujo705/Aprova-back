import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus, VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type Faixa = 'verde' | 'amarelo' | 'laranja' | 'vermelho' | 'sem_dados';

export interface PerformancePeriodo {
  /** Inicio do periodo (inclusivo). Nulo = desde sempre. */
  de: Date | null;
  /** Fim do periodo (exclusivo). Nulo = ate agora. */
  ate: Date | null;
}

export interface EditorPerformanceVideo {
  videoId: string;
  nome: string;
  projetoNome: string;
  /** Nota geral 0-10 (nota do cliente x2); null quando aprovado sem nota. */
  nota: number | null;
  /** Quantas versoes a cadeia teve ate a aprovacao (1 = aprovado de primeira). */
  versoes: number;
  aprovadoEm: string;
  /** true/false quando havia prazo; null quando o video nao tinha prazo. */
  noPrazo: boolean | null;
}

export interface EditorPerformance {
  editorId: string;
  nome: string;
  avatarUrl: string | null;
  /** Papel na conta: o owner so aparece quando e responsavel por algum video. */
  papel: 'owner' | 'editor';
  // --- periodo escolhido -----------------------------------------------
  notaMedia: number | null;
  videosAprovadosCount: number;
  faixa: Faixa;
  /** Media de versoes ate aprovar (1,0 = tudo aprovado de primeira). */
  mediaVersoes: number | null;
  aprovadosDePrimeira: number;
  /** Aprovados que tinham prazo / desses, quantos foram entregues no prazo. */
  aprovadosComPrazo: number;
  aprovadosNoPrazo: number;
  /** Nota media do periodo anterior de mesmo tamanho (null sem periodo/dados). */
  notaMediaAnterior: number | null;
  // --- agora (independe do periodo) -------------------------------------
  emAndamento: number;
  emAjuste: number;
  atrasados: number;
  /** Aprovados do periodo, mais recentes primeiro (no maximo 50). */
  videos: EditorPerformanceVideo[];
}

const DIA_MS = 24 * 60 * 60 * 1000;
const MAX_VIDEOS_POR_PESSOA = 50;

/** Uma cadeia de versoes (raiz + novas versoes) tratada como uma entrega so. */
interface Cadeia {
  ultima: {
    id: string;
    nomeArquivo: string;
    status: VideoStatus;
    notaGeral: number | null;
    aprovadoEm: Date | null;
    criadoEm: Date;
    arquivoRemovidoEm: Date | null;
    projetoNome: string;
  };
  versoes: number;
  prazo: Date | null;
  responsaveis: Set<string>;
}

interface Acumulado {
  aprovados: number;
  somaNotas: number;
  notas: number;
  somaVersoes: number;
  dePrimeira: number;
  comPrazo: number;
  noPrazo: number;
  videos: EditorPerformanceVideo[];
}

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Desempenho por pessoa da equipe. Lista todos os editores ativos (mesmo
   * sem dados, para o owner ver a equipe inteira) e os owners que sao
   * responsaveis por algum video.
   *
   * Cada cadeia de versoes (video raiz + novas versoes via video_pai_id) conta
   * como UMA entrega: status, nota e data de aprovacao vem da versao mais
   * recente, e os responsaveis sao a uniao dos responsaveis de todas as
   * versoes (nova versao nao herda os responsaveis da anterior). Cada entrega
   * conta integralmente para cada responsavel.
   *
   * - notaMedia: media da nota_geral (1-5) x2, escala 0-10.
   * - Periodo filtra pela data de aprovacao (aprovado_em; aprovados antigos
   *   sem essa data usam a data de envio da versao aprovada).
   * - No prazo: a versao aprovada foi enviada ate o fim do dia do prazo (o
   *   prazo e gravado como meia-noite do dia). Mede a entrega da equipe, nao
   *   a demora do cliente para aprovar.
   * - emAndamento/emAjuste/atrasados sao fotografia de agora.
   */
  async getPerformance(
    accountId: string,
    periodo: PerformancePeriodo = { de: null, ate: null },
  ): Promise<EditorPerformance[]> {
    const memberships = await this.prisma.membership.findMany({
      where: {
        accountId,
        status: UserStatus.ativo,
        role: { in: [UserRole.owner, UserRole.editor] },
      },
      select: {
        role: true,
        user: { select: { id: true, nome: true, avatarUrl: true } },
      },
    });
    if (memberships.length === 0) return [];

    const videos = await this.prisma.video.findMany({
      where: { isExemplo: false, project: { accountId, isExemplo: false } },
      select: {
        id: true,
        videoPaiId: true,
        nomeArquivo: true,
        status: true,
        notaGeral: true,
        aprovadoEm: true,
        criadoEm: true,
        deadline: true,
        arquivoRemovidoEm: true,
        project: { select: { nome: true } },
        responsaveis: { select: { userId: true } },
      },
    });

    const cadeias = this.montarCadeias(videos);
    const agora = new Date();
    const anterior = this.periodoAnterior(periodo);

    const atual = new Map<string, Acumulado>();
    const passado = new Map<string, { soma: number; n: number }>();
    const abertos = new Map<
      string,
      { emAndamento: number; emAjuste: number; atrasados: number }
    >();

    for (const c of cadeias) {
      if (c.responsaveis.size === 0) continue;
      const u = c.ultima;

      if (u.status === VideoStatus.aprovado) {
        const aprovadoEm = u.aprovadoEm ?? u.criadoEm;
        const noPrazo = c.prazo
          ? u.criadoEm.getTime() < c.prazo.getTime() + DIA_MS
          : null;

        if (this.dentro(aprovadoEm, periodo)) {
          for (const userId of c.responsaveis) {
            const acc = atual.get(userId) ?? this.novoAcumulado();
            acc.aprovados += 1;
            acc.somaVersoes += c.versoes;
            if (c.versoes === 1) acc.dePrimeira += 1;
            if (u.notaGeral !== null) {
              acc.somaNotas += u.notaGeral;
              acc.notas += 1;
            }
            if (noPrazo !== null) {
              acc.comPrazo += 1;
              if (noPrazo) acc.noPrazo += 1;
            }
            acc.videos.push({
              videoId: u.id,
              nome: u.nomeArquivo,
              projetoNome: u.projetoNome,
              nota: u.notaGeral !== null ? u.notaGeral * 2 : null,
              versoes: c.versoes,
              aprovadoEm: aprovadoEm.toISOString(),
              noPrazo,
            });
            atual.set(userId, acc);
          }
        } else if (
          anterior &&
          u.notaGeral !== null &&
          this.dentro(aprovadoEm, anterior)
        ) {
          for (const userId of c.responsaveis) {
            const p = passado.get(userId) ?? { soma: 0, n: 0 };
            p.soma += u.notaGeral;
            p.n += 1;
            passado.set(userId, p);
          }
        }
      } else if (u.status !== VideoStatus.erro && !u.arquivoRemovidoEm) {
        const atrasado =
          c.prazo !== null && agora.getTime() >= c.prazo.getTime() + DIA_MS;
        for (const userId of c.responsaveis) {
          const a = abertos.get(userId) ?? {
            emAndamento: 0,
            emAjuste: 0,
            atrasados: 0,
          };
          a.emAndamento += 1;
          if (u.status === VideoStatus.ajuste) a.emAjuste += 1;
          if (atrasado) a.atrasados += 1;
          abertos.set(userId, a);
        }
      }
    }

    const temAtribuicao = new Set<string>();
    for (const c of cadeias)
      c.responsaveis.forEach((id) => temAtribuicao.add(id));

    return memberships
      .filter((m) => m.role === UserRole.editor || temAtribuicao.has(m.user.id))
      .map((m) => {
        const acc = atual.get(m.user.id) ?? this.novoAcumulado();
        const aberto = abertos.get(m.user.id);
        const p = passado.get(m.user.id);
        const notaMedia = this.escala10(acc.somaNotas, acc.notas);
        acc.videos.sort((a, b) => b.aprovadoEm.localeCompare(a.aprovadoEm));
        return {
          editorId: m.user.id,
          nome: m.user.nome,
          avatarUrl: m.user.avatarUrl,
          papel: m.role === UserRole.owner ? 'owner' : 'editor',
          notaMedia,
          videosAprovadosCount: acc.aprovados,
          faixa: this.faixaFor(notaMedia),
          mediaVersoes:
            acc.aprovados > 0
              ? Number((acc.somaVersoes / acc.aprovados).toFixed(1))
              : null,
          aprovadosDePrimeira: acc.dePrimeira,
          aprovadosComPrazo: acc.comPrazo,
          aprovadosNoPrazo: acc.noPrazo,
          notaMediaAnterior: p ? this.escala10(p.soma, p.n) : null,
          emAndamento: aberto?.emAndamento ?? 0,
          emAjuste: aberto?.emAjuste ?? 0,
          atrasados: aberto?.atrasados ?? 0,
          videos: acc.videos.slice(0, MAX_VIDEOS_POR_PESSOA),
        };
      });
  }

  /** Agrupa as versoes pela raiz da cadeia (segue video_pai_id). */
  private montarCadeias(
    videos: {
      id: string;
      videoPaiId: string | null;
      nomeArquivo: string;
      status: VideoStatus;
      notaGeral: number | null;
      aprovadoEm: Date | null;
      criadoEm: Date;
      deadline: Date | null;
      arquivoRemovidoEm: Date | null;
      project: { nome: string };
      responsaveis: { userId: string }[];
    }[],
  ): Cadeia[] {
    const porId = new Map(videos.map((v) => [v.id, v]));
    const raizCache = new Map<string, string>();
    const raizDe = (id: string): string => {
      const cached = raizCache.get(id);
      if (cached) return cached;
      const visitados = new Set<string>();
      let atual = porId.get(id)!;
      while (
        atual.videoPaiId &&
        porId.has(atual.videoPaiId) &&
        !visitados.has(atual.videoPaiId)
      ) {
        visitados.add(atual.id);
        atual = porId.get(atual.videoPaiId)!;
      }
      raizCache.set(id, atual.id);
      return atual.id;
    };

    const grupos = new Map<string, typeof videos>();
    for (const v of videos) {
      const raiz = raizDe(v.id);
      const g = grupos.get(raiz) ?? [];
      g.push(v);
      grupos.set(raiz, g);
    }

    const cadeias: Cadeia[] = [];
    for (const versoes of grupos.values()) {
      versoes.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
      const ultima = versoes[versoes.length - 1];
      // Prazo da versao mais recente; nova versao nao herda o prazo, entao
      // cai para o ultimo prazo definido na cadeia.
      const prazo =
        [...versoes].reverse().find((v) => v.deadline)?.deadline ?? null;
      const responsaveis = new Set<string>();
      for (const v of versoes) {
        for (const r of v.responsaveis) responsaveis.add(r.userId);
      }
      cadeias.push({
        ultima: {
          id: ultima.id,
          nomeArquivo: ultima.nomeArquivo,
          status: ultima.status,
          notaGeral: ultima.notaGeral,
          aprovadoEm: ultima.aprovadoEm,
          criadoEm: ultima.criadoEm,
          arquivoRemovidoEm: ultima.arquivoRemovidoEm,
          projetoNome: ultima.project.nome,
        },
        versoes: versoes.length,
        prazo,
        responsaveis,
      });
    }
    return cadeias;
  }

  private periodoAnterior(p: PerformancePeriodo): PerformancePeriodo | null {
    if (!p.de) return null;
    const fim = p.ate ?? new Date();
    const tamanho = fim.getTime() - p.de.getTime();
    if (tamanho <= 0) return null;
    return { de: new Date(p.de.getTime() - tamanho), ate: p.de };
  }

  private dentro(data: Date, p: PerformancePeriodo): boolean {
    if (p.de && data < p.de) return false;
    if (p.ate && data >= p.ate) return false;
    return true;
  }

  private novoAcumulado(): Acumulado {
    return {
      aprovados: 0,
      somaNotas: 0,
      notas: 0,
      somaVersoes: 0,
      dePrimeira: 0,
      comPrazo: 0,
      noPrazo: 0,
      videos: [],
    };
  }

  private escala10(soma: number, n: number): number | null {
    return n > 0 ? Number(((soma / n) * 2).toFixed(1)) : null;
  }

  private faixaFor(notaMedia: number | null): Faixa {
    if (notaMedia === null) return 'sem_dados';
    if (notaMedia >= 8) return 'verde';
    if (notaMedia >= 6) return 'amarelo';
    if (notaMedia >= 4) return 'laranja';
    return 'vermelho';
  }
}
