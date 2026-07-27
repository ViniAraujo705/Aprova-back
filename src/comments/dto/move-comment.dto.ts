import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Move um comentário do cliente para a revisão interna de outro vídeo.
 */
export class MoveCommentDto {
  @ApiProperty({
    description: 'Vídeo de destino (mesma conta do vídeo de origem).',
  })
  @IsUUID('4')
  videoDestinoId: string;
}
