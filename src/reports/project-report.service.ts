import { Injectable, NotFoundException } from '@nestjs/common';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from './pdf.service';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  ajuste: 'Ajuste solicitado',
  erro: 'Erro',
};

@Injectable()
export class ProjectReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  /**
   * Gera o relatório em PDF de um projeto (escopado ao usuário dono).
   * Retorna o buffer e o nome do arquivo sugerido.
   */
  async generate(
    accountId: string,
    projectId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, accountId },
      select: {
        nome: true,
        criadoEm: true,
        client: { select: { nome: true, email: true } },
        videos: {
          orderBy: [{ versao: 'asc' }],
          select: {
            id: true,
            nomeArquivo: true,
            versao: true,
            status: true,
            criadoEm: true,
            comments: {
              // Relatorio expoe apenas o canal do cliente; o canal
              // interno da agencia nunca entra no PDF.
              where: { channel: 'cliente' },
              orderBy: { timestampVideo: 'asc' },
              select: {
                timestampVideo: true,
                texto: true,
                autorNome: true,
                criadoEm: true,
                autorUser: { select: { nome: true } },
              },
            },
            ratings: {
              select: {
                nota: true,
                ratingQuestion: { select: { texto: true, ordem: true } },
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Projeto nao encontrado');
    }

    const docDefinition = this.buildDocDefinition(project);
    const buffer = await this.pdf.build(docDefinition);
    const filename = `relatorio-${this.slug(project.nome)}.pdf`;
    return { buffer, filename };
  }

  private buildDocDefinition(project: {
    nome: string;
    criadoEm: Date;
    client: { nome: string; email: string | null };
    videos: {
      nomeArquivo: string;
      versao: number;
      status: string;
      criadoEm: Date;
      comments: {
        timestampVideo: number;
        texto: string;
        autorNome: string | null;
        criadoEm: Date;
        autorUser: { nome: string } | null;
      }[];
      ratings: {
        nota: number;
        ratingQuestion: { texto: string; ordem: number };
      }[];
    }[];
  }): TDocumentDefinitions {
    const content: Content[] = [
      { text: 'Relatório do Projeto', style: 'title' },
      { text: project.nome, style: 'h1' },
      {
        style: 'meta',
        text: [
          { text: 'Cliente: ', bold: true },
          project.client.email
            ? `${project.client.nome} (${project.client.email})\n`
            : `${project.client.nome}\n`,
          { text: 'Gerado em: ', bold: true },
          this.formatDate(new Date()),
        ],
      },
      {
        text: `${project.videos.length} vídeo(s) no projeto`,
        style: 'meta',
        margin: [0, 4, 0, 12],
      },
    ];

    if (project.videos.length === 0) {
      content.push({ text: 'Nenhum vídeo neste projeto.', italics: true });
    }

    project.videos.forEach((video, idx) => {
      if (idx > 0) content.push({ text: '', margin: [0, 8, 0, 0] });

      content.push({
        text: `${video.nomeArquivo}  —  v${video.versao}`,
        style: 'h2',
      });
      content.push({
        style: 'meta',
        text: [
          { text: 'Status: ', bold: true },
          `${STATUS_LABEL[video.status] ?? video.status}    `,
          { text: 'Enviado em: ', bold: true },
          this.formatDate(video.criadoEm),
        ],
        margin: [0, 0, 0, 6],
      });

      // Notas médias por pergunta de avaliação
      content.push(this.ratingsBlock(video.ratings));

      // Comentários agrupados por vídeo
      content.push({
        text: `Comentários (${video.comments.length})`,
        style: 'h3',
        margin: [0, 6, 0, 2],
      });
      if (video.comments.length === 0) {
        content.push({
          text: 'Sem comentários.',
          italics: true,
          style: 'small',
        });
      } else {
        content.push({
          ul: video.comments.map((c) => ({
            text: [
              {
                text: `[${this.formatTimestamp(c.timestampVideo)}] `,
                bold: true,
              },
              {
                text: `${c.autorNome ?? c.autorUser?.nome ?? 'Agencia'}: `,
                bold: true,
              },
              c.texto,
              {
                text: `  (${this.formatDate(c.criadoEm)})`,
                style: 'small',
                color: '#888888',
              },
            ],
            margin: [0, 1, 0, 1],
          })),
        });
      }
    });

    return {
      content,
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      styles: {
        title: { fontSize: 12, color: '#888888', margin: [0, 0, 0, 2] },
        h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 6] },
        h2: { fontSize: 14, bold: true, margin: [0, 6, 0, 2] },
        h3: { fontSize: 11, bold: true },
        meta: { fontSize: 10, color: '#444444' },
        small: { fontSize: 8 },
      },
    };
  }

  private ratingsBlock(
    ratings: {
      nota: number;
      ratingQuestion: { texto: string; ordem: number };
    }[],
  ): Content {
    if (ratings.length === 0) {
      return {
        text: 'Sem avaliações.',
        italics: true,
        style: 'small',
        margin: [0, 2, 0, 2],
      };
    }

    // Agrupa dinamicamente pelas perguntas de avaliacao respondidas neste
    // video (perguntas sao customizaveis por conta, nao mais fixas).
    const porPergunta = new Map<string, { ordem: number; notas: number[] }>();
    for (const r of ratings) {
      const atual = porPergunta.get(r.ratingQuestion.texto) ?? {
        ordem: r.ratingQuestion.ordem,
        notas: [],
      };
      atual.notas.push(r.nota);
      porPergunta.set(r.ratingQuestion.texto, atual);
    }
    const perguntas = [...porPergunta.entries()].sort(
      (a, b) => a[1].ordem - b[1].ordem,
    );

    const body: Content[][] = [
      perguntas.map(([texto]) => ({ text: texto, bold: true, fontSize: 9 })),
      perguntas.map(([, { notas }]) => ({
        text: (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1),
        fontSize: 10,
      })),
    ];

    return {
      table: { widths: perguntas.map(() => '*'), body },
      layout: 'lightHorizontalLines',
      margin: [0, 2, 0, 2],
    };
  }

  private formatTimestamp(seconds: number): string {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  }

  private formatDate(d: Date): string {
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private slug(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }
}
