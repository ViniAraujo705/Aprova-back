import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  // null limpa a descricao; ausente deixa como esta (ver PortfoliosService.update)
  @IsOptional()
  @IsString()
  descricao?: string | null;
}
