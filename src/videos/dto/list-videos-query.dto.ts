import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListVideosQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'project_id invalido' })
  project_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Default 50, teto 100 - lista sem project_id busca de todos os projetos
  // da conta, entao um limite alto sem paginacao vira uma query pesada
  // conforme a conta acumula videos.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
