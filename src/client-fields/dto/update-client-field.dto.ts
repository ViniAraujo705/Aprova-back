import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateClientFieldDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  rotulo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;
}
