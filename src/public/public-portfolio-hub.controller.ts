import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';

/**
 * Hub publico unico da agencia - lista categorias e os albuns (Portfolio)
 * de cada uma, cada card apontando pro link individual do album
 * (/public/portfolios/:linkPublico). SEM autenticacao.
 */
@ApiTags('public')
@Controller('public/portfolio-hub')
export class PublicPortfolioHubController {
  constructor(private readonly publicService: PublicService) {}

  @Get(':linkHub')
  @ApiOperation({
    summary:
      'Hub publico da agencia: foto de perfil, branding e categorias com seus portfolios.',
  })
  getPortfolioHub(@Param('linkHub') linkHub: string) {
    return this.publicService.getPortfolioHub(linkHub);
  }
}
