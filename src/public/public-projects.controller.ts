import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';

/**
 * Rota de acesso do cliente - SEM autenticacao.
 * Entrada unica da galeria: o identificador e o link_publico (uuid) do
 * projeto, nao do video.
 */
@ApiTags('public')
@Controller('public/projects')
export class PublicProjectsController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':linkPublico')
  @ApiOperation({
    summary:
      'Galeria pública do projeto: lista todos os vídeos (thumbnail, status) a partir de um único link.',
  })
  getProject(
    @Param('linkPublico', new ParseUUIDPipe({ version: '4' }))
    linkPublico: string,
  ) {
    return this.publicService.getProject(linkPublico);
  }
}
