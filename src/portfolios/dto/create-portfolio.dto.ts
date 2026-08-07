import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePortfolioDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  // Categoria do hub publico (ver PortfolioCategory) - omitido/null = sem categoria
  @IsOptional()
  @IsUUID('4', { message: 'categoriaId invalido' })
  categoriaId?: string | null;
}
