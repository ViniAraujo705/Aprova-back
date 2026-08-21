import { Module } from '@nestjs/common';
import { RecordingEventsService } from './recording-events.service';
import { RecordingEventsController } from './recording-events.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [NotificationsModule, PlansModule],
  controllers: [RecordingEventsController],
  providers: [RecordingEventsService],
})
export class RecordingEventsModule {}
