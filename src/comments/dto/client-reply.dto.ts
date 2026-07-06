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
 * Resposta do owner ao cliente, no canal cliente. O autor e o owner
 * autenticado; opcionalmente responde um comentario do cliente.
 */
export class ClientReplyDto {
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
    description:
      'Comentário do cliente que está sendo respondido (mesmo canal cliente).',
  })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;
}
