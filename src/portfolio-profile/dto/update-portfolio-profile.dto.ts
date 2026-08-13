import { IsIn, IsOptional, IsUrl } from 'class-validator';

const PORTFOLIO_TEMPLATE_IDS = [
  'minimalista',
  'grade',
  'revista',
  'editorial-escuro',
  'retrato',
] as const;

type PortfolioTemplateId = (typeof PORTFOLIO_TEMPLATE_IDS)[number];

export class UpdatePortfolioProfileDto {
  // null limpa a foto; ausente deixa como esta
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'fotoUrl deve ser uma URL valida' })
  fotoUrl?: string | null;

  // null deixa a escolha de layout livre; ausente preserva o tema atual.
  @IsOptional()
  @IsIn(PORTFOLIO_TEMPLATE_IDS, { message: 'templateId invalido' })
  templateId?: PortfolioTemplateId | null;
}
