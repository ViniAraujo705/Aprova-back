import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { LabelColor } from '@prisma/client';

export class CreateLabelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  text: string;

  @IsEnum(LabelColor, {
    message: 'color deve ser: red, orange, amber, emerald, sky, violet ou pink',
  })
  color: LabelColor;
}
