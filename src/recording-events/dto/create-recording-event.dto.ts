import {
  IsArray,
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
  @IsArray()
  @IsUUID('4', { each: true, message: 'equipeIds invalido' })
  equipeIds?: string[];

  @IsOptional()
  @IsString()
  observacoes?: string | null;
}
