import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateDemandaDto } from './create-demanda.dto';

// etapa nao entra aqui - move de etapa via PATCH /demandas/:id/etapa.
export class UpdateDemandaDto extends PartialType(
  OmitType(CreateDemandaDto, ['etapa'] as const),
) {}
