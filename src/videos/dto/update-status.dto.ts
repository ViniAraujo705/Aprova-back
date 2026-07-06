import { IsEnum } from 'class-validator';
import { VideoStatus } from '@prisma/client';

export class UpdateStatusDto {
  @IsEnum(VideoStatus, {
    message: 'status deve ser: pendente, aprovado, ajuste ou erro',
  })
  status: VideoStatus;
}
