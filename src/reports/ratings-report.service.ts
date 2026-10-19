import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Historico de notas dos clientes (aba "Avaliacoes" de /relatorios).
 *
 * Devolve as linhas cruas e deixa a agregacao (media por pergunta, por
 * cliente, por mes) com o frontend, no mesmo espirito do resto da tela de
 * relatorios. As linhas carregam os nomes copiados no momento da avaliacao
 * (Rating.videoNome/projetoNome/clienteNome), entao continuam aparecendo
 * depois que o video, o projeto ou o cliente forem excluidos; enquanto
 * existirem, o nome atual tem preferencia.
 */
@Injectable()
export class RatingsReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string, de?: Date, ate?: Date) {
    const [ratings, perguntas] = await Promise.all([
      this.prisma.rating.findMany({
        where: {
          accountId,
          ...(de || ate
            ? {
                criadoEm: {
                  ...(de ? { gte: de } : {}),
                  ...(ate ? { lte: ate } : {}),
                },
              }
            : {}),
        },
        orderBy: { criadoEm: 'desc' },
        take: 5000,
        select: {
          id: true,
          nota: true,
          criadoEm: true,
          ratingQuestionId: true,
          videoId: true,
          projectId: true,
          clienteId: true,
          videoNome: true,
          projetoNome: true,
          clienteNome: true,
          video: {
            select: { nomeArquivo: true, thumbnailUrl: true, versao: true },
          },
          project: {
            select: {
              nome: true,
              contatoAvulso: true,
              client: { select: { nome: true } },
            },
          },
          cliente: { select: { nome: true } },
        },
      }),
      this.prisma.ratingQuestion.findMany({
        where: { accountId },
        orderBy: { ordem: 'asc' },
        select: { id: true, texto: true, ordem: true, ativo: true },
      }),
    ]);

    return {
      perguntas,
      avaliacoes: ratings.map((r) => ({
        id: r.id,
        nota: r.nota,
        criadoEm: r.criadoEm,
        ratingQuestionId: r.ratingQuestionId,
        videoId: r.videoId,
        projectId: r.projectId,
        clienteId: r.clienteId,
        videoNome: r.video?.nomeArquivo ?? r.videoNome ?? 'Video',
        versao: r.video?.versao ?? null,
        thumbnailUrl: r.video?.thumbnailUrl ?? null,
        projetoNome: r.project?.nome ?? r.projetoNome ?? '',
        clienteNome:
          r.cliente?.nome ??
          r.project?.client?.nome ??
          r.project?.contatoAvulso ??
          r.clienteNome ??
          '',
        // Video/projeto excluido: a nota fica, mas nao ha mais para onde linkar.
        excluido: r.videoId === null,
      })),
    };
  }
}
