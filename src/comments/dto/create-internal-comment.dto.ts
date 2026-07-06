import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Comentario do canal interno (owner/editor). O autor e sempre o usuario
 * autenticado — nao ha nome livre.
 */
export class CreateInternalCommentDto {
  @ApiProperty({ description: 'Momento do vídeo em segundos.', minimum: 0 })
  @IsInt()
  @Min(0)
  timestampVideo: number;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  texto: string;

  @ApiProperty({
    required: false,
    description: 'Comentário pai (resposta em thread, mesmo canal).',
  })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
