import { IsOptional, IsUrl } from 'class-validator';

export class UpdatePortfolioProfileDto {
  // null limpa a foto; ausente deixa como esta
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'fotoUrl deve ser uma URL valida' })
  fotoUrl?: string | null;
}
