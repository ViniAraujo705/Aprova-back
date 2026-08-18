import { Module } from '@nestjs/common';
import { RecordingEventsService } from './recording-events.service';
import { RecordingEventsController } from './recording-events.controller';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [GoogleCalendarModule, NotificationsModule],
  controllers: [RecordingEventsController],
  providers: [RecordingEventsService],
})
export class RecordingEventsModule {}
