import { Module } from '@nestjs/common';
import { RecordingEventsService } from './recording-events.service';
import { RecordingEventsController } from './recording-events.controller';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [GoogleCalendarModule, NotificationsModule, PlansModule],
  controllers: [RecordingEventsController],
  providers: [RecordingEventsService],
})
export class RecordingEventsModule {}
