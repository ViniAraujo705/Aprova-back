import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CommentAuthorType,
  CommentChannel,
  UserRole,
  VideoStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna apenas os dados do video referenciado pelo link_publico,
   * seus comentarios e ratings. Nenhum dado de outros videos, projetos
   * ou do profissional e exposto.
   */
  async getVideo(linkPublico: string) {
    const video = await this.resolveVideo(linkPublico);

    const [comments, ratings] = await Promise.all([
      this.prisma.comment.findMany({
        // Canal publico: SOMENTE comentarios do canal do cliente. O canal
        // interno da agencia nunca e exposto aqui.
        where: { videoId: video.id, channel: CommentChannel.cliente },
        orderBy: { timestampVideo: 'asc' },
        select: {
          id: true,
          timestampVideo: true,
          texto: true,
          autorType: true,
          autorNome: true,
          // Respostas do owner ao cliente aparecem no mesmo canal; o nome
          // vem do usuario autenticado (autor_nome fica nulo nesse caso).
          autorUser: { select: { nome: true } },
          parentId: true,
          criadoEm: true,
        },
      }),
      this.prisma.rating.findMany({
        where: { videoId: video.id },
        orderBy: { criadoEm: 'asc' },
        select: {
          id: true,
          categoria: true,
          nota: true,
          criadoEm: true,
        },
      }),
    ]);

    return {
      id: video.id,
      nomeArquivo: video.nomeArquivo,
      urlStorage: video.urlStorage,
      // Versao otimizada para streaming (null enquanto processa); o
      // frontend usa esta se pronta, senao cai no original.
      urlOtimizada: video.urlOtimizada,
      thumbnailUrl: video.thumbnailUrl,
      statusProcessamento: video.statusProcessamento,
      versao: video.versao,
      status: video.status,
      criadoEm: video.criadoEm,
      // Dados para montar a visualizacao "Preview Reels" e as Open Graph
      // tags (preview do WhatsApp) no frontend
      projeto: { nome: video.project.nome },
      cliente: { nome: video.project.client.nome },
      // Branding (white label) da agencia dona do video. O nome vem da
      // conta; logo/cor vem do owner da agencia.
      agencia: {
        nome: video.project.account.nomeAgencia,
        logoUrl: video.project.account.users[0]?.logoUrl ?? null,
        corDestaque: video.project.account.users[0]?.corDestaque ?? null,
      },
      // Canal ja filtrado para "cliente": isAgencyReply so distingue a
      // resposta do owner (autorType owner) da mensagem do proprio cliente.
      comments: comments.map((c) => ({
        ...c,
        isAgencyReply: c.autorType === CommentAuthorType.owner,
      })),
      ratings,
    };
  }

  async addComment(linkPublico: string, dto: CreateCommentDto) {
    const video = await this.resolveVideo(linkPublico);
    return this.prisma.comment.create({
      data: {
        videoId: video.id,
        timestampVideo: dto.timestampVideo,
        texto: dto.texto,
        // Comentario do cliente externo (sem login): canal cliente,
        // autor cliente, nome livre.
        channel: CommentChannel.cliente,
        autorType: CommentAuthorType.cliente,
        autorNome: dto.autorNome,
      },
      select: {
        id: true,
        timestampVideo: true,
        texto: true,
        autorType: true,
        autorNome: true,
        criadoEm: true,
      },
    });
  }

  async addRating(linkPublico: string, dto: CreateRatingDto) {
    const video = await this.resolveVideo(linkPublico);
    return this.prisma.rating.create({
      data: {
        videoId: video.id,
        categoria: dto.categoria,
        nota: dto.nota,
      },
      select: {
        id: true,
        categoria: true,
        nota: true,
        criadoEm: true,
      },
    });
  }

  approve(linkPublico: string) {
    return this.setStatus(linkPublico, VideoStatus.aprovado);
  }

  requestChanges(linkPublico: string) {
    return this.setStatus(linkPublico, VideoStatus.ajuste);
  }

  private async setStatus(linkPublico: string, status: VideoStatus) {
    const video = await this.resolveVideo(linkPublico);
    const updated = await this.prisma.video.update({
      where: { id: video.id },
      data: {
        status,
        // Carimba o momento da aprovacao (usado nas metricas de tempo
        // medio de aprovacao). Nao mexe em outras transicoes.
        ...(status === VideoStatus.aprovado
          ? { aprovadoEm: new Date() }
          : {}),
      },
      select: { id: true, status: true, aprovadoEm: true },
    });
    return updated;
  }

  /**
   * Resolve o video pelo link_publico ou lanca 404.
   * Seleciona apenas campos publicos - nunca expoe project_id/user.
   */
  private async resolveVideo(linkPublico: string) {
    const video = await this.prisma.video.findUnique({
      where: { linkPublico },
      select: {
        id: true,
        nomeArquivo: true,
        urlStorage: true,
        thumbnailUrl: true,
        urlOtimizada: true,
        statusProcessamento: true,
        versao: true,
        status: true,
        criadoEm: true,
        // Somente o nome do projeto/cliente e o branding da agencia deste
        // video - nada mais e exposto.
        project: {
          select: {
            nome: true,
            client: { select: { nome: true } },
            account: {
              select: {
                nomeAgencia: true,
                // Branding (logo/cor) vem do owner da agencia.
                users: {
                  where: { role: UserRole.owner },
                  select: { logoUrl: true, corDestaque: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    return video;
  }
}
