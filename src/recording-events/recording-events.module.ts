import { Module } from '@nestjs/common';
import { RecordingEventsService } from './recording-events.service';
import { RecordingEventsController } from './recording-events.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [RecordingEventsController],
  providers: [RecordingEventsService],
})
export class RecordingEventsModule {}
