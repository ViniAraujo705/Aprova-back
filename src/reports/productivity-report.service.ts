import { Injectable } from '@nestjs/common';
import {
  CommentAuthorType,
  EtapaProducao,
  UserRole,
  UserStatus,
  VideoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  agruparCadeias,
  DIA_MS,
  fimDoPrazo,
} from '../common/video-chains.util';

const HORA_MS = 60 * 60 * 1000;
/** Brasil sem horario de verao: meses fecham em UTC-3. */
const OFFSET_BR_MS = -3 * HORA_MS;
const MESES_SERIE = 12;

/** Faixas do tempo entre o primeiro envio e a aprovacao. */
const FAIXAS_APROVACAO: { faixa: string; ateHoras: number }[] = [
  { faixa: 'ate_1d', ateHoras: 24 },
  { faixa: '1_3d', ateHoras: 72 },
  { faixa: '3_7d', ateHoras: 168 },
  { faixa: '7_14d', ateHoras: 336 },
  { faixa: 'mais_14d', ateHoras: Infinity },
];

const ETAPAS_EM_FLUXO: EtapaProducao[] = [
  EtapaProducao.planejado,
  EtapaProducao.producao,
  EtapaProducao.edicao,
  EtapaProducao.aguardando_aprovacao,
  EtapaProducao.ajustes,
];

interface Periodo {
  de: Date | null;
  ate: Date | null;
}

/** Uma cadeia de versoes vista como uma entrega. */
interface Entrega {
  videoId: string;
  nome: string;
  projetoNome: string;
  clienteKey: string;
  clienteId: string | null;
  clienteNome: string;
  clienteFoto: string | null;
  enviadoEm: Date;
  ultimaVersaoEm: Date;
  status: VideoStatus;
  etapa: EtapaProducao;
  aprovadoEm: Date | null;
  nota: number | null;
  versoes: number;
  prazo: Date | null;
  comentariosCliente: number;
  responsaveis: Set<string>;
  aberta: boolean;
}

interface Acc {
  enviados: number;
  aprovados: number;
  somaNotas: number;
  notas: number;
  somaVersoes: number;
  somaHoras: number;
  horas: number[];
}

const novoAcc = (): Acc => ({
  enviados: 0,
  aprovados: 0,
  somaNotas: 0,
  notas: 0,
  somaVersoes: 0,
  somaHoras: 0,
  horas: [],
});

/**
 * Relatorio de produtividade (aba "Produtividade" de /relatorios), calculado
 * inteiro no backend a partir das cadeias de versoes:
 *
 * - "enviados" contam pela data do primeiro envio; "aprovados" (nota, versoes,
 *   tempo ate aprovar, prazo) contam pela data de aprovacao.
 * - "agora" (em aberto, esperando cliente, atrasados, etapas) e fotografia do
 *   momento, sem periodo.
 * - Nota em escala 0-10 (nota do cliente 1-5 x2), como no resto do sistema.
 */
@Injectable()
export class ProductivityReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(accountId: string, periodo: Periodo) {
    const agora = new Date();
    const anterior = this.periodoAnterior(periodo, agora);

    const [videos, memberships, gravacoes] = await Promise.all([
      this.prisma.video.findMany({
        where: { isExemplo: false, project: { accountId, isExemplo: false } },
        select: {
          id: true,
          videoPaiId: true,
          nomeArquivo: true,
          status: true,
          etapaProducao: true,
          notaGeral: true,
          aprovadoEm: true,
          criadoEm: true,
          deadline: true,
          arquivoRemovidoEm: true,
          responsaveis: { select: { userId: true } },
          _count: {
            select: {
              comments: { where: { autorType: CommentAuthorType.cliente } },
            },
          },
          project: {
            select: {
              nome: true,
              contatoAvulso: true,
              client: { select: { id: true, nome: true, fotoUrl: true } },
            },
          },
        },
      }),
      this.prisma.membership.findMany({
        where: {
          accountId,
          status: UserStatus.ativo,
          role: { in: [UserRole.owner, UserRole.editor] },
        },
        select: {
          role: true,
          user: { select: { id: true, nome: true, avatarUrl: true } },
        },
      }),
      this.prisma.recordingEvent.findMany({
        where: {
          accountId,
          ...(periodo.de || periodo.ate
            ? {
                dataInicio: {
                  ...(periodo.de ? { gte: periodo.de } : {}),
                  ...(periodo.ate ? { lt: periodo.ate } : {}),
                },
              }
            : {}),
        },
        select: {
          membroId: true,
          equipe: { select: { crewMember: { select: { userId: true } } } },
        },
      }),
    ]);

    const entregas: Entrega[] = agruparCadeias(videos).map((versoes) => {
      const raiz = versoes[0];
      const ultima = versoes[versoes.length - 1];
      const prazo =
        [...versoes].reverse().find((v) => v.deadline)?.deadline ?? null;
      const responsaveis = new Set<string>();
      let comentariosCliente = 0;
      for (const v of versoes) {
        v.responsaveis.forEach((r) => responsaveis.add(r.userId));
        comentariosCliente += v._count.comments;
      }
      const client = ultima.project.client;
      const avulso = ultima.project.contatoAvulso;
      const aprovado = ultima.status === VideoStatus.aprovado;
      return {
        videoId: ultima.id,
        nome: ultima.nomeArquivo,
        projetoNome: ultima.project.nome,
        clienteKey: client ? client.id : avulso ? `avulso:${avulso}` : 'sem',
        clienteId: client?.id ?? null,
        clienteNome: client?.nome ?? avulso ?? 'Sem cliente',
        clienteFoto: client?.fotoUrl ?? null,
        enviadoEm: raiz.criadoEm,
        ultimaVersaoEm: ultima.criadoEm,
        status: ultima.status,
        etapa: ultima.etapaProducao,
        // Aprovados antigos sem aprovado_em usam a data de envio da versao.
        aprovadoEm: aprovado ? (ultima.aprovadoEm ?? ultima.criadoEm) : null,
        nota: aprovado ? ultima.notaGeral : null,
        versoes: versoes.length,
        prazo,
        comentariosCliente,
        responsaveis,
        aberta:
          !aprovado &&
          ultima.etapaProducao !== EtapaProducao.entregue &&
          ultima.status !== VideoStatus.erro &&
          !ultima.arquivoRemovidoEm,
      };
    });

    const aprovadasNo = (p: Periodo) =>
      entregas.filter((e) => e.aprovadoEm && this.dentro(e.aprovadoEm, p));
    const enviadasNo = (p: Periodo) =>
      entregas.filter((e) => this.dentro(e.enviadoEm, p));

    const aprovadas = aprovadasNo(periodo);
    const aprovadasAnt = anterior ? aprovadasNo(anterior) : null;
    const abertas = entregas.filter((e) => e.aberta);
    const atrasada = (e: Entrega) =>
      e.prazo !== null && agora.getTime() >= fimDoPrazo(e.prazo);

    return {
      periodo: {
        de: periodo.de?.toISOString() ?? null,
        ate: periodo.ate?.toISOString() ?? null,
        temAnterior: anterior !== null,
      },
      resumo: {
        enviados: enviadasNo(periodo).length,
        enviadosAnterior: anterior ? enviadasNo(anterior).length : null,
        ...this.resumoAprovadas(aprovadas),
        anterior: aprovadasAnt ? this.resumoAprovadas(aprovadasAnt) : null,
      },
      agora: {
        emAberto: abertas.length,
        esperandoCliente: abertas.filter(
          (e) => e.status === VideoStatus.pendente,
        ).length,
        emAjuste: abertas.filter((e) => e.status === VideoStatus.ajuste).length,
        atrasados: abertas.filter(atrasada).length,
        porEtapa: ETAPAS_EM_FLUXO.map((etapa) => ({
          etapa,
          total: abertas.filter((e) => e.etapa === etapa).length,
        })),
        atrasadosLista: abertas
          .filter(atrasada)
          .map((e) => ({
            ...this.itemLista(e),
            prazo: e.prazo!.toISOString(),
            diasAtraso: Math.floor(
              (agora.getTime() - fimDoPrazo(e.prazo!)) / DIA_MS,
            ),
          }))
          .sort((a, b) => b.diasAtraso - a.diasAtraso)
          .slice(0, 20),
        esperandoLista: abertas
          .filter((e) => e.status === VideoStatus.pendente)
          .map((e) => ({
            ...this.itemLista(e),
            desde: e.ultimaVersaoEm.toISOString(),
            diasEsperando: Math.floor(
              (agora.getTime() - e.ultimaVersaoEm.getTime()) / DIA_MS,
            ),
          }))
          .sort((a, b) => b.diasEsperando - a.diasEsperando)
          .slice(0, 10),
      },
      mensal: this.serieMensal(entregas, agora),
      distribuicaoNotas: [1, 2, 3, 4, 5].map((estrelas) => ({
        estrelas,
        total: aprovadas.filter((e) => e.nota === estrelas).length,
      })),
      tempoAprovacao: this.faixasAprovacao(aprovadas),
      clientes: this.porCliente(entregas, periodo, atrasada),
      equipe: this.porPessoa(
        memberships,
        entregas,
        periodo,
        atrasada,
        gravacoes,
      ),
    };
  }

  private resumoAprovadas(aprovadas: Entrega[]) {
    const comNota = aprovadas.filter((e) => e.nota !== null);
    const comPrazo = aprovadas.filter((e) => e.prazo !== null);
    const horas = aprovadas
      .map((e) => this.horasAteAprovar(e))
      .sort((a, b) => a - b);
    const n = aprovadas.length;
    return {
      aprovados: n,
      notaMedia: this.escala10(
        comNota.reduce((s, e) => s + e.nota!, 0),
        comNota.length,
      ),
      avaliados: comNota.length,
      aprovadosDePrimeira: aprovadas.filter((e) => e.versoes === 1).length,
      mediaVersoes: n
        ? this.arred(aprovadas.reduce((s, e) => s + e.versoes, 0) / n)
        : null,
      horasAteAprovarMediana: horas.length
        ? this.arred(this.mediana(horas))
        : null,
      horasAteAprovarMedia: horas.length
        ? this.arred(horas.reduce((s, h) => s + h, 0) / horas.length)
        : null,
      aprovadosComPrazo: comPrazo.length,
      aprovadosNoPrazo: comPrazo.filter(
        (e) => e.ultimaVersaoEm.getTime() < fimDoPrazo(e.prazo!),
      ).length,
      comentariosClientePorEntrega: n
        ? this.arred(
            aprovadas.reduce((s, e) => s + e.comentariosCliente, 0) / n,
          )
        : null,
    };
  }

  private itemLista(e: Entrega) {
    return {
      videoId: e.videoId,
      nome: e.nome,
      projetoNome: e.projetoNome,
      clienteNome: e.clienteNome,
    };
  }

  /** Ultimos 12 meses (inclui o atual), mais antigo primeiro, em horario do Brasil. */
  private serieMensal(entregas: Entrega[], agora: Date) {
    const chave = (d: Date) => {
      const br = new Date(d.getTime() + OFFSET_BR_MS);
      return `${br.getUTCFullYear()}-${String(br.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const hojeBr = new Date(agora.getTime() + OFFSET_BR_MS);
    const meses = Array.from({ length: MESES_SERIE }, (_, i) => {
      const d = new Date(
        Date.UTC(
          hojeBr.getUTCFullYear(),
          hojeBr.getUTCMonth() - (MESES_SERIE - 1 - i),
          1,
        ),
      );
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const mapa = new Map(meses.map((m) => [m, novoAcc()]));
    for (const e of entregas) {
      const env = mapa.get(chave(e.enviadoEm));
      if (env) env.enviados += 1;
      if (e.aprovadoEm) {
        const apr = mapa.get(chave(e.aprovadoEm));
        if (apr) {
          apr.aprovados += 1;
          if (e.nota !== null) {
            apr.somaNotas += e.nota;
            apr.notas += 1;
          }
        }
      }
    }
    return meses.map((mes) => {
      const a = mapa.get(mes)!;
      return {
        mes,
        enviados: a.enviados,
        aprovados: a.aprovados,
        notaMedia: this.escala10(a.somaNotas, a.notas),
      };
    });
  }

  private faixasAprovacao(aprovadas: Entrega[]) {
    const contagem = FAIXAS_APROVACAO.map((f) => ({
      faixa: f.faixa,
      total: 0,
    }));
    for (const e of aprovadas) {
      const h = this.horasAteAprovar(e);
      const i = FAIXAS_APROVACAO.findIndex((f) => h < f.ateHoras);
      contagem[i].total += 1;
    }
    return contagem;
  }

  private porCliente(
    entregas: Entrega[],
    periodo: Periodo,
    atrasada: (e: Entrega) => boolean,
  ) {
    const grupos = new Map<
      string,
      {
        clienteId: string | null;
        nome: string;
        fotoUrl: string | null;
        acc: Acc;
        comPrazo: number;
        noPrazo: number;
        emAberto: number;
        esperando: number;
        atrasados: number;
      }
    >();
    for (const e of entregas) {
      const g = grupos.get(e.clienteKey) ?? {
        clienteId: e.clienteId,
        nome: e.clienteNome,
        fotoUrl: e.clienteFoto,
        acc: novoAcc(),
        comPrazo: 0,
        noPrazo: 0,
        emAberto: 0,
        esperando: 0,
        atrasados: 0,
      };
      if (this.dentro(e.enviadoEm, periodo)) g.acc.enviados += 1;
      if (e.aprovadoEm && this.dentro(e.aprovadoEm, periodo)) {
        this.somarAprovada(g.acc, e);
        if (e.prazo) {
          g.comPrazo += 1;
          if (e.ultimaVersaoEm.getTime() < fimDoPrazo(e.prazo)) g.noPrazo += 1;
        }
      }
      if (e.aberta) {
        g.emAberto += 1;
        if (e.status === VideoStatus.pendente) g.esperando += 1;
        if (atrasada(e)) g.atrasados += 1;
      }
      grupos.set(e.clienteKey, g);
    }
    return [...grupos.values()]
      .filter((g) => g.acc.enviados || g.acc.aprovados || g.emAberto)
      .map((g) => ({
        clienteId: g.clienteId,
        nome: g.nome,
        fotoUrl: g.fotoUrl,
        enviados: g.acc.enviados,
        aprovados: g.acc.aprovados,
        notaMedia: this.escala10(g.acc.somaNotas, g.acc.notas),
        mediaVersoes: g.acc.aprovados
          ? this.arred(g.acc.somaVersoes / g.acc.aprovados)
          : null,
        horasAteAprovarMediana: g.acc.horas.length
          ? this.arred(this.mediana(g.acc.horas.sort((a, b) => a - b)))
          : null,
        aprovadosComPrazo: g.comPrazo,
        aprovadosNoPrazo: g.noPrazo,
        emAberto: g.emAberto,
        esperandoCliente: g.esperando,
        atrasados: g.atrasados,
      }))
      .sort(
        (a, b) =>
          b.atrasados - a.atrasados ||
          b.aprovados - a.aprovados ||
          b.emAberto - a.emAberto,
      );
  }

  private porPessoa(
    memberships: {
      role: UserRole;
      user: { id: string; nome: string; avatarUrl: string | null };
    }[],
    entregas: Entrega[],
    periodo: Periodo,
    atrasada: (e: Entrega) => boolean,
    gravacoes: {
      membroId: string | null;
      equipe: { crewMember: { userId: string | null } }[];
    }[],
  ) {
    return memberships
      .map((m) => {
        const id = m.user.id;
        const minhas = entregas.filter((e) => e.responsaveis.has(id));
        const aprovadas = minhas.filter(
          (e) => e.aprovadoEm && this.dentro(e.aprovadoEm, periodo),
        );
        const abertas = minhas.filter((e) => e.aberta);
        const comNota = aprovadas.filter((e) => e.nota !== null);
        return {
          userId: id,
          nome: m.user.nome,
          avatarUrl: m.user.avatarUrl,
          papel: m.role === UserRole.owner ? 'owner' : 'editor',
          aprovados: aprovadas.length,
          notaMedia: this.escala10(
            comNota.reduce((s, e) => s + e.nota!, 0),
            comNota.length,
          ),
          emAberto: abertas.length,
          atrasados: abertas.filter(atrasada).length,
          gravacoes: gravacoes.filter(
            (g) =>
              g.membroId === id ||
              g.equipe.some((c) => c.crewMember.userId === id),
          ).length,
        };
      })
      .filter(
        (p) => p.papel === 'editor' || p.aprovados || p.emAberto || p.gravacoes,
      )
      .sort(
        (a, b) =>
          b.atrasados - a.atrasados ||
          b.aprovados - a.aprovados ||
          b.emAberto - a.emAberto,
      );
  }

  private somarAprovada(acc: Acc, e: Entrega) {
    acc.aprovados += 1;
    acc.somaVersoes += e.versoes;
    const h = this.horasAteAprovar(e);
    acc.somaHoras += h;
    acc.horas.push(h);
    if (e.nota !== null) {
      acc.somaNotas += e.nota;
      acc.notas += 1;
    }
  }

  private horasAteAprovar(e: Entrega): number {
    return Math.max(
      0,
      (e.aprovadoEm!.getTime() - e.enviadoEm.getTime()) / HORA_MS,
    );
  }

  private periodoAnterior(p: Periodo, agora: Date): Periodo | null {
    if (!p.de) return null;
    const fim = p.ate ?? agora;
    const tamanho = fim.getTime() - p.de.getTime();
    if (tamanho <= 0) return null;
    return { de: new Date(p.de.getTime() - tamanho), ate: p.de };
  }

  private dentro(data: Date, p: Periodo): boolean {
    if (p.de && data < p.de) return false;
    if (p.ate && data >= p.ate) return false;
    return true;
  }

  private mediana(ordenados: number[]): number {
    const m = Math.floor(ordenados.length / 2);
    return ordenados.length % 2
      ? ordenados[m]
      : (ordenados[m - 1] + ordenados[m]) / 2;
  }

  private escala10(soma: number, n: number): number | null {
    return n > 0 ? Number(((soma / n) * 2).toFixed(1)) : null;
  }

  private arred(n: number): number {
    return Number(n.toFixed(1));
  }
}
