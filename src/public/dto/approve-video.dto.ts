import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ApproveVideoDto {
  @IsOptional()
  @IsInt()
  @Min(1, { message: 'notaGeral minima e 1' })
  @Max(5, { message: 'notaGeral maxima e 5' })
  notaGeral?: number;

  // Recado opcional para a equipe, mostrado no dashboard da agencia.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000, { message: 'depoimento pode ter no maximo 1000 caracteres' })
  depoimento?: string;
}
