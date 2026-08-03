import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateRecordingEventDto {
  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsDateString()
  dataInicio: string;

  @IsOptional()
  @IsDateString()
  dataFim?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'clienteId invalido' })
  clienteId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'membroId invalido' })
  membroId?: string | null;

  @IsOptional()
  @IsString()
  observacoes?: string | null;
}
