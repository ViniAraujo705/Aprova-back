import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';
import { ApproveVideoDto } from './dto/approve-video.dto';
import { AudioUploadUrlDto } from './dto/audio-upload-url.dto';
import { UpdateTituloDto } from './dto/update-titulo.dto';

/**
 * Rotas de acesso do cliente - SEM autenticacao.
 * O identificador e sempre o link_publico do video. Formato opaco - pode
 * ser um UUID (links antigos) ou um id curto (links novos, ver
 * short-id.util.ts).
 */
@ApiTags('public')
@Controller('public/videos')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':linkPublico')
  @ApiOperation({
    summary:
      'Dados públicos do vídeo: thumbnail, projeto/cliente, branding da agência (Open Graph) + comentários e ratings.',
  })
  getVideo(@Param('linkPublico') linkPublico: string) {
    return this.publicService.getVideo(linkPublico);
  }

  @Post(':linkPublico/comments/audio-upload-url')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  createCommentAudioUploadUrl(
    @Param('linkPublico') linkPublico: string,
    @Body() dto: AudioUploadUrlDto,
  ) {
    return this.publicService.createCommentAudioUploadUrl(linkPublico, dto);
  }

  @Post(':linkPublico/comments')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addComment(
    @Param('linkPublico') linkPublico: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.publicService.addComment(linkPublico, dto);
  }

  @Post(':linkPublico/ratings')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addRating(
    @Param('linkPublico') linkPublico: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.publicService.addRating(linkPublico, dto);
  }

  @Post(':linkPublico/approve')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('linkPublico') linkPublico: string,
    @Body() dto: ApproveVideoDto,
  ) {
    return this.publicService.approve(linkPublico, dto);
  }

  @Post(':linkPublico/request-changes')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  requestChanges(@Param('linkPublico') linkPublico: string) {
    return this.publicService.requestChanges(linkPublico);
  }

  @Patch(':linkPublico/titulo')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  updateTitulo(
    @Param('linkPublico') linkPublico: string,
    @Body() dto: UpdateTituloDto,
  ) {
    return this.publicService.updateTitulo(linkPublico, dto);
  }
}
