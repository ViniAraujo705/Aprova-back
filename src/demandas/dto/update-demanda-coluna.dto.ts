import { IsNumber, IsOptional, IsUUID } from 'class-validator';

/** Move um card de quadro extra para outra coluna (do mesmo quadro). */
export class UpdateDemandaColunaDto {
  @IsUUID('4', { message: 'colunaId invalido' })
  colunaId: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  posicao?: number;
}
