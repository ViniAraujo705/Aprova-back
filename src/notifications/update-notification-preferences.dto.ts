import { NotificationType } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  emailResumoDiario?: boolean;

  @IsOptional()
  @IsBoolean()
  emailImediato?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(NotificationType, { each: true })
  emailTiposDesligados?: NotificationType[];
}
