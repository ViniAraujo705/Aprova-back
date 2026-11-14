import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateDemandaDto } from './create-demanda.dto';

// etapa nao entra aqui - move de etapa via PATCH /demandas/:id/etapa.
export class UpdateDemandaDto extends PartialType(
  OmitType(CreateDemandaDto, ['etapa', 'quadroId', 'colunaId'] as const),
) {
  /** Prazo marcado como cumprido (para de gerar alerta de prazo). */
  @IsOptional()
  @IsBoolean()
  prazoConcluido?: boolean;
}
