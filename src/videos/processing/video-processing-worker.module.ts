import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VIDEO_PROCESSING_QUEUE } from './video-processing.constants';
import { VideoProcessingProcessor } from './video-processing.processor';

/**
 * Registra o consumidor (@Processor) da fila de video. Importado apenas
 * pelo WorkerModule (processo separado do processo web) - ver
 * src/main-worker.ts. O processo web importa VideosModule normalmente,
 * que so enfileira jobs (VideoProcessingService) e nunca instancia o
 * VideoProcessingProcessor.
 */
@Module({
  imports: [BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE })],
  providers: [VideoProcessingProcessor],
})
export class VideoProcessingWorkerModule {}
