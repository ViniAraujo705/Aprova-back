import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCommentDto {
  // Momento do video em segundos ao qual o comentario se refere
  @IsInt()
  @Min(0)
  timestampVideo: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  texto: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  autorNome: string;
}
