import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class NotifyRecordingEventDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'equipeIds deve conter ao menos uma pessoa' })
  @IsUUID('4', { each: true, message: 'equipeIds invalido' })
  equipeIds: string[];
}
