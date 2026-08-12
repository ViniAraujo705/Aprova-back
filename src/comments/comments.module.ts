import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ClientActivityModule } from '../client-activity/client-activity.module';

@Module({
  imports: [ClientActivityModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
