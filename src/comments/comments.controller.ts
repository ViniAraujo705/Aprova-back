import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CreateInternalCommentDto } from './dto/create-internal-comment.dto';
import { ClientReplyDto } from './dto/client-reply.dto';
import { MoveCommentDto } from './dto/move-comment.dto';

/**
 * Canais de comentario autenticados de um video. O isolamento por conta
 * (account_id do token) e o de canal e feito no CommentsService.
 */
@ApiTags('comments')
@ApiBearerAuth()
@Controller('videos/:id/comments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('internal')
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary:
      'Canal INTERNO: lista os comentários privados da agência (owner + editor da mesma conta).',
  })
  listInternal(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) videoId: string,
  ) {
    return this.commentsService.listInternal(user.accountId, videoId, user);
  }

  @Post('internal')
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary:
      'Canal INTERNO: cria comentário como owner ou editor (autor_type conforme o token). Aceita parent_comment_id.',
  })
  createInternal(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: CreateInternalCommentDto,
  ) {
    return this.commentsService.createInternal(
      user.accountId,
      user,
      videoId,
      dto,
    );
  }

  @Post('client-reply')
  @Roles(UserRole.owner)
  @ApiOperation({
    summary:
      'Canal CLIENTE: resposta do owner ao cliente (apenas owner). Aceita parent_comment_id do comentário do cliente.',
  })
  clientReply(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: ClientReplyDto,
  ) {
    return this.commentsService.clientReply(user.accountId, user, videoId, dto);
  }

  @Delete(':commentId')
  @Roles(UserRole.owner, UserRole.editor)
  @HttpCode(204)
  @ApiOperation({
    summary: 'Canal CLIENTE: exclui um comentário do cliente (owner/editor).',
  })
  deleteClientComment(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Param('commentId', new ParseUUIDPipe({ version: '4' })) commentId: string,
  ) {
    return this.commentsService.deleteClientComment(
      user.accountId,
      videoId,
      commentId,
      user,
    );
  }

  @Post(':commentId/move')
  @Roles(UserRole.owner, UserRole.editor)
  @ApiOperation({
    summary:
      'Canal CLIENTE: move um comentário do cliente para o canal INTERNO de outro vídeo da mesma conta, preservando autor_type = cliente.',
  })
  moveComment(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Param('commentId', new ParseUUIDPipe({ version: '4' })) commentId: string,
    @Body() dto: MoveCommentDto,
  ) {
    return this.commentsService.moveToInternal(
      user.accountId,
      videoId,
      commentId,
      dto,
      user,
    );
  }
}
