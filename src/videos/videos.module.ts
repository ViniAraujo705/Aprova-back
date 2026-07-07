import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VIDEO_PROCESSING_QUEUE } from './processing/video-processing.constants';
import { VideoProcessingService } from './processing/video-processing.service';
import { VideoProcessingProcessor } from './processing/video-processing.processor';

@Module({
  imports: [BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE })],
  controllers: [VideosController],
  providers: [VideosService, VideoProcessingService, VideoProcessingProcessor],
  exports: [VideosService],
})
export class VideosModule {}
