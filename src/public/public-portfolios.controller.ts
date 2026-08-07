import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';

/**
 * Rota de acesso publico da vitrine da agencia (Portfolio) - SEM
 * autenticacao. Distinta de PublicProjectsController: nenhum dado de
 * cliente/projeto/status e exposto, so o portfolio em si.
 */
@ApiTags('public')
@Controller('public/portfolios')
export class PublicPortfoliosController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':linkPublico')
  @ApiOperation({
    summary:
      'Portfolio publico da agencia: nome, descricao, branding e videos - sem dado de cliente/projeto/status.',
  })
  getPortfolio(@Param('linkPublico') linkPublico: string) {
    return this.publicService.getPortfolio(linkPublico);
  }
}
