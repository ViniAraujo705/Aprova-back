import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PortfoliosService } from './portfolios.service';
import { PortfoliosController } from './portfolios.controller';
import { VIDEO_PROCESSING_QUEUE } from '../videos/processing/video-processing.constants';
import { VideoProcessingService } from '../videos/processing/video-processing.service';
import { PlansModule } from '../plans/plans.module';

// Registra a mesma fila de VideosModule (mesmo padrao usado pra separar
// produtor/consumidor entre processo web e worker - ver
// VideoProcessingWorkerModule): so enfileira jobs aqui, quem consome e
// o Processor ja registrado em VideosModule (ou no worker, se estiver
// rodando separado).
@Module({
  imports: [
    BullModule.registerQueue({ name: VIDEO_PROCESSING_QUEUE }),
    PlansModule,
  ],
  controllers: [PortfoliosController],
  providers: [PortfoliosService, VideoProcessingService],
})
export class PortfoliosModule {}
