import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PublicService } from './public.service';
import { ProjectDownloadService } from './project-download.service';
import { DownloadVideosDto } from './dto/download-videos.dto';

/**
 * Rota de acesso do cliente - SEM autenticacao.
 * Entrada unica da galeria: o identificador e o link_publico do projeto,
 * nao do video. Formato opaco - pode ser um UUID (links antigos) ou um id
 * curto (links novos, ver short-id.util.ts).
 */
@ApiTags('public')
@Controller('public/projects')
export class PublicProjectsController {
  constructor(
    private readonly publicService: PublicService,
    private readonly downloads: ProjectDownloadService,
  ) {}

  @Get(':linkPublico')
  @ApiOperation({
    summary:
      'Galeria pública do projeto: lista todos os vídeos (thumbnail, status) a partir de um único link.',
  })
  getProject(@Param('linkPublico') linkPublico: string) {
    return this.publicService.getProject(linkPublico);
  }

  @Post(':linkPublico/download')
  @ApiOperation({
    summary:
      'Prepara o download em lote: valida a seleção e devolve uma URL temporária assinada do ZIP + os vídeos ignorados (url vem null quando nenhum está disponível).',
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  prepareDownload(
    @Param('linkPublico') linkPublico: string,
    @Body() dto: DownloadVideosDto,
    @Req() req: Request,
  ) {
    // A URL do zip e esta mesma rota + o token. Montada a partir da request
    // (e nao de uma env var) para funcionar em qualquer dominio/prefixo em
    // que a API estiver publicada.
    const baseUrl = `${req.protocol}://${req.get('host')}${req.originalUrl.split('?')[0]}`;
    return this.downloads.prepare(linkPublico, dto, baseUrl);
  }

  @Get(':linkPublico/download/:token')
  @ApiOperation({
    summary:
      'Baixa o ZIP dos vídeos selecionados (link temporário assinado gerado pelo POST acima). Download direto.',
  })
  @ApiProduces('application/zip')
  // Limite baixo de proposito: cada request aqui transmite a entrega inteira
  // do projeto: um toque legitimo no celular consome uma so.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  downloadZip(
    @Param('linkPublico') linkPublico: string,
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    return this.downloads.streamZip(linkPublico, token, res);
  }
}
