import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosService } from './videos.service';
import { VideosController } from './videos.controller';
import { VIDEO_PROCESSING_QUEUE } from './processing/video-processing.constants';
import { VideoProcessingService } from './processing/video-processing.service';
import { VideoProcessingProcessor } from './processing/video-processing.processor';
import { PlansModule } from '../plans/plans.module';
import { ClientActivityModule } from '../client-activity/client-activity.module';

// O split worker/API (processo web so enfileira, um processo separado
// consome - ver WorkerModule/src/main-worker.ts e
// VideoProcessingWorkerModule) ainda depende de um 2o servico no Railway
// que nao foi provisionado. Ate isso ser configurado, o consumidor
// (VideoProcessingProcessor) continua registrado aqui tambem, pra nao
// deixar videos presos em "processando" sem ninguem consumindo a fila.
@Module({
  imports: [
    BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE }),
    PlansModule,
    ClientActivityModule,
  ],
  controllers: [VideosController],
  providers: [VideosService, VideoProcessingService, VideoProcessingProcessor],
  exports: [VideosService, VideoProcessingService],
})
export class VideosModule {}
