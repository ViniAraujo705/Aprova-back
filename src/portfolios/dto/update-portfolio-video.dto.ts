import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePortfolioVideoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  titulo?: string;

  // null limpa a descricao; ausente deixa como esta
  @IsOptional()
  @IsString()
  descricao?: string | null;
}
