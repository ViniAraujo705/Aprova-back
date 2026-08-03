import { Module } from '@nestjs/common';
import { RecordingEventsService } from './recording-events.service';
import { RecordingEventsController } from './recording-events.controller';

@Module({
  controllers: [RecordingEventsController],
  providers: [RecordingEventsService],
})
export class RecordingEventsModule {}
