import { IsDateString, IsOptional } from 'class-validator';

/** Periodo do desempenho da equipe, filtrado pela data de aprovacao. */
export class PerformanceQueryDto {
  /** Inicio (inclusivo), ISO 8601. Sem ele: desde sempre. */
  @IsOptional()
  @IsDateString()
  de?: string;

  /** Fim (exclusivo), ISO 8601. Sem ele: ate agora. */
  @IsOptional()
  @IsDateString()
  ate?: string;
}
