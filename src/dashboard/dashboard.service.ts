import { Injectable } from '@nestjs/common';
import { VideoStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ClienteTempoMedio {
  clientId: string;
  nome: string;
  tempoMedioHoras: number;
  amostras: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insights do painel da agência, sempre escopados à conta autenticada
   * (via project.accountId). Nenhum dado de outra conta entra nos
   * cálculos.
   *
   * @param accountId conta (agência) dona dos dados
   * @param horasPendentes janela (em horas) para considerar um vídeo
   *   "parado" sem resposta do cliente (padrão 48h).
   */
  async getInsights(accountId: string, horasPendentes = 48) {
    const agora = new Date();
    const cutoffPendentes = new Date(
      agora.getTime() - horasPendentes * 60 * 60 * 1000,
    );
    const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const [pendentesAtrasados, aprovadosNoMes, aprovados] = await Promise.all([
      // 1. Vídeos pendentes há mais que o período configurado
      this.prisma.video.count({
        where: {
          status: VideoStatus.pendente,
          criadoEm: { lt: cutoffPendentes },
          project: { accountId },
        },
      }),
      // 4. Total de vídeos aprovados no mês atual
      this.prisma.video.count({
        where: {
          status: VideoStatus.aprovado,
          aprovadoEm: { gte: inicioDoMes },
          project: { accountId },
        },
      }),
      // 2 e 3. Base para o tempo médio de aprovação por cliente
      this.prisma.video.findMany({
        where: {
          status: VideoStatus.aprovado,
          aprovadoEm: { not: null },
          project: { accountId },
        },
        select: {
          criadoEm: true,
          aprovadoEm: true,
          project: {
            select: { client: { select: { id: true, nome: true } } },
          },
        },
      }),
    ]);

    const { maisRapido, maisLento } =
      this.tempoMedioPorCliente(aprovados);

    return {
      periodoPendentesHoras: horasPendentes,
      videosPendentesAtrasados: pendentesAtrasados,
      videosAprovadosNoMes: aprovadosNoMes,
      clienteAprovacaoMaisRapida: maisRapido,
      clienteAprovacaoMaisLenta: maisLento,
    };
  }

  /**
   * Calcula o tempo médio (do envio do link/criação do vídeo até a
   * aprovação) por cliente e retorna o de menor e o de maior média.
   */
  private tempoMedioPorCliente(
    aprovados: {
      criadoEm: Date;
      aprovadoEm: Date | null;
      project: { client: { id: string; nome: string } };
    }[],
  ): {
    maisRapido: ClienteTempoMedio | null;
    maisLento: ClienteTempoMedio | null;
  } {
    const acc = new Map<
      string,
      { nome: string; totalMs: number; amostras: number }
    >();

    for (const v of aprovados) {
      if (!v.aprovadoEm) continue;
      const durMs = v.aprovadoEm.getTime() - v.criadoEm.getTime();
      if (durMs < 0) continue;
      const { id, nome } = v.project.client;
      const cur = acc.get(id) ?? { nome, totalMs: 0, amostras: 0 };
      cur.totalMs += durMs;
      cur.amostras += 1;
      acc.set(id, cur);
    }

    const medias: ClienteTempoMedio[] = [...acc.entries()].map(
      ([clientId, { nome, totalMs, amostras }]) => ({
        clientId,
        nome,
        amostras,
        tempoMedioHoras: Number(
          (totalMs / amostras / (60 * 60 * 1000)).toFixed(2),
        ),
      }),
    );

    if (medias.length === 0) {
      return { maisRapido: null, maisLento: null };
    }

    const ordenado = [...medias].sort(
      (a, b) => a.tempoMedioHoras - b.tempoMedioHoras,
    );
    return {
      maisRapido: ordenado[0],
      maisLento: ordenado[ordenado.length - 1],
    };
  }
}
