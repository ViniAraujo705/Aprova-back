import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

/**
 * Rotas de acesso do cliente - SEM autenticacao.
 * O identificador e sempre o link_publico (uuid) do video.
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
  getVideo(
    @Param('linkPublico', new ParseUUIDPipe({ version: '4' }))
    linkPublico: string,
  ) {
    return this.publicService.getVideo(linkPublico);
  }

  @Post(':linkPublico/comments')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addComment(
    @Param('linkPublico', new ParseUUIDPipe({ version: '4' }))
    linkPublico: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.publicService.addComment(linkPublico, dto);
  }

  @Post(':linkPublico/ratings')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  addRating(
    @Param('linkPublico', new ParseUUIDPipe({ version: '4' }))
    linkPublico: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.publicService.addRating(linkPublico, dto);
  }

  @Post(':linkPublico/approve')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('linkPublico', new ParseUUIDPipe({ version: '4' }))
    linkPublico: string,
  ) {
    return this.publicService.approve(linkPublico);
  }

  @Post(':linkPublico/request-changes')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  requestChanges(
    @Param('linkPublico', new ParseUUIDPipe({ version: '4' }))
    linkPublico: string,
  ) {
    return this.publicService.requestChanges(linkPublico);
  }
}
