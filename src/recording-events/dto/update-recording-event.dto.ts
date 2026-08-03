import { PartialType } from '@nestjs/mapped-types';
import { CreateRecordingEventDto } from './create-recording-event.dto';

export class UpdateRecordingEventDto extends PartialType(
  CreateRecordingEventDto,
) {}
