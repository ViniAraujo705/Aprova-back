import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommentAuthorType, CommentChannel, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertProjectAccess } from '../common/project-access.util';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { CreateInternalCommentDto } from './dto/create-internal-comment.dto';
import { ClientReplyDto } from './dto/client-reply.dto';
import { MoveCommentDto } from './dto/move-comment.dto';

// Campos retornados em qualquer leitura/criacao de comentario autenticado.
const COMMENT_SELECT = {
  id: true,
  timestampVideo: true,
  texto: true,
  channel: true,
  autorType: true,
  autorNome: true,
  autorUserId: true,
  autorUser: { select: { id: true, nome: true, role: true } },
  parentId: true,
  criadoEm: true,
} as const;

type CommentRow = {
  channel: CommentChannel;
  autorType: CommentAuthorType;
  autorUser: { id: string; nome: string; role: UserRole } | null;
} & Record<string, unknown>;

/**
 * Formata o comentario para a API: renomeia autorUser.role -> teamRole e
 * deriva isAgencyReply (resposta da agencia no canal do cliente) — o front
 * so reconhece esses nomes, nao "role"/um flag cru de canal.
 */
function toCommentDto<T extends CommentRow>(comment: T) {
  const { autorUser, ...rest } = comment;
  return {
    ...rest,
    autorUser: autorUser
      ? { id: autorUser.id, nome: autorUser.nome, teamRole: autorUser.role }
      : null,
    isAgencyReply:
      comment.channel === CommentChannel.cliente &&
      comment.autorType === CommentAuthorType.owner,
  };
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Canal INTERNO — lista os comentarios da agencia (owner + editor da
   * mesma conta). Nunca inclui o canal cliente.
   */
  async listInternal(accountId: string, videoId: string, user: AuthUser) {
    await this.assertVideoInAccount(accountId, videoId, user);
    const comments = await this.prisma.comment.findMany({
      where: { videoId, channel: CommentChannel.interno },
      orderBy: [{ timestampVideo: 'asc' }, { criadoEm: 'asc' }],
      select: COMMENT_SELECT,
    });
    return comments.map(toCommentDto);
  }

  /**
   * Canal INTERNO — cria comentario como owner ou editor conforme o token.
   */
  async createInternal(
    accountId: string,
    author: AuthUser,
    videoId: string,
    dto: CreateInternalCommentDto,
  ) {
    await this.assertVideoInAccount(accountId, videoId, author);
    await this.assertParent(videoId, CommentChannel.interno, dto.parentId);

    const comment = await this.prisma.comment.create({
      data: {
        videoId,
        timestampVideo: dto.timestampVideo,
        texto: dto.texto,
        channel: CommentChannel.interno,
        // owner ou editor, conforme quem esta autenticado
        autorType:
          author.role === UserRole.owner
            ? CommentAuthorType.owner
            : CommentAuthorType.editor,
        autorUserId: author.id,
        parentId: dto.parentId ?? null,
      },
      select: COMMENT_SELECT,
    });
    return toCommentDto(comment);
  }

  /**
   * Canal CLIENTE — resposta do owner ao cliente. Apenas owner (garantido
   * pelo RolesGuard no controller). Fica no mesmo canal do cliente.
   */
  async clientReply(
    accountId: string,
    owner: AuthUser,
    videoId: string,
    dto: ClientReplyDto,
  ) {
    await this.assertVideoInAccount(accountId, videoId, owner);
    await this.assertParent(videoId, CommentChannel.cliente, dto.parentId);

    const comment = await this.prisma.comment.create({
      data: {
        videoId,
        timestampVideo: dto.timestampVideo,
        texto: dto.texto,
        channel: CommentChannel.cliente,
        autorType: CommentAuthorType.owner,
        autorUserId: owner.id,
        parentId: dto.parentId ?? null,
      },
      select: COMMENT_SELECT,
    });
    return toCommentDto(comment);
  }

  /**
   * Canal CLIENTE — exclui um comentario do cliente (usado pelo owner/editor
   * para moderar o canal do cliente). Nao afeta o canal interno.
   */
  async deleteClientComment(
    accountId: string,
    videoId: string,
    commentId: string,
    user: AuthUser,
  ) {
    await this.assertVideoInAccount(accountId, videoId, user);
    const comment = await this.assertClientComment(videoId, commentId);
    await this.prisma.comment.delete({ where: { id: comment.id } });
  }

  /**
   * Move um comentario do cliente (canal cliente) para o canal interno de
   * outro video da MESMA conta, recriando-o com autor_type = cliente para
   * preservar o badge "Cliente" na thread interna.
   */
  async moveToInternal(
    accountId: string,
    videoId: string,
    commentId: string,
    dto: MoveCommentDto,
    user: AuthUser,
  ) {
    await this.assertVideoInAccount(accountId, videoId, user);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        videoId: true,
        channel: true,
        timestampVideo: true,
        texto: true,
        autorNome: true,
      },
    });
    if (!comment || comment.videoId !== videoId) {
      throw new NotFoundException('Comentario nao encontrado');
    }
    if (comment.channel !== CommentChannel.cliente) {
      throw new BadRequestException(
        'Comentario nao pertence ao canal do cliente',
      );
    }
    // Garante que o video de destino existe e pertence a mesma conta.
    await this.assertVideoInAccount(accountId, dto.videoDestinoId, user);

    const moved = await this.prisma.$transaction(async (tx) => {
      await tx.comment.delete({ where: { id: comment.id } });
      return tx.comment.create({
        data: {
          videoId: dto.videoDestinoId,
          timestampVideo: comment.timestampVideo,
          texto: comment.texto,
          channel: CommentChannel.interno,
          autorType: CommentAuthorType.cliente,
          autorNome: comment.autorNome,
          parentId: null,
        },
        select: COMMENT_SELECT,
      });
    });
    return toCommentDto(moved);
  }

  /**
   * Garante que o comentario existe, pertence ao video informado e esta no
   * canal do cliente (as unicas operacoes de exclusao/mover suportadas).
   */
  private async assertClientComment(videoId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, videoId: true, channel: true },
    });
    if (!comment || comment.videoId !== videoId) {
      throw new NotFoundException('Comentario nao encontrado');
    }
    if (comment.channel !== CommentChannel.cliente) {
      throw new BadRequestException(
        'Comentario nao pertence ao canal do cliente',
      );
    }
    return comment;
  }

  /**
   * Garante que o video existe e pertence a conta do usuario autenticado.
   * Base do isolamento por account_id exigido pelos guards.
   */
  private async assertVideoInAccount(
    accountId: string,
    videoId: string,
    user: AuthUser,
  ) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        projectId: true,
        project: { select: { accountId: true } },
      },
    });
    if (!video) {
      throw new NotFoundException('Video nao encontrado');
    }
    if (video.project.accountId !== accountId) {
      throw new ForbiddenException('Video nao pertence a esta conta');
    }
    await assertProjectAccess(this.prisma, video.projectId, user);
    return video;
  }

  /**
   * Valida a resposta em thread: o comentario pai precisa existir, ser do
   * mesmo video e do MESMO canal — nunca cruza canal cliente/interno.
   */
  private async assertParent(
    videoId: string,
    channel: CommentChannel,
    parentId?: string,
  ) {
    if (!parentId) {
      return;
    }
    const parent = await this.prisma.comment.findUnique({
      where: { id: parentId },
      select: { videoId: true, channel: true },
    });
    if (!parent || parent.videoId !== videoId || parent.channel !== channel) {
      throw new BadRequestException(
        'Comentario pai invalido para este video/canal',
      );
    }
  }
}
