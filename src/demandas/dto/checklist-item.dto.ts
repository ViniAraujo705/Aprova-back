import { PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  texto: string;
}

export class UpdateChecklistItemDto extends PartialType(CreateChecklistItemDto) {
  @IsOptional()
  @IsBoolean()
  concluido?: boolean;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  posicao?: number;
}
