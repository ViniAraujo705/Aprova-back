import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateComentarioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  texto: string;

  /** Membros marcados com @ no texto (o front resolve o nome para o id). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true, message: 'mencionados deve conter UUIDs validos' })
  mencionados?: string[];
}

export class UpdateComentarioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  texto: string;
}
