import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { MediaModule } from './media/media.module';
import { VideoProcessingWorkerModule } from './videos/processing/video-processing-worker.module';
import { bullmqConnectionFactory } from './queue/bullmq-connection';

/**
 * Root module do processo worker (src/main-worker.ts): so o necessario
 * pra consumir a fila de processamento de video (Prisma, R2, ffmpeg).
 * Deliberadamente nao importa AppModule - nao precisa de HTTP, auth,
 * billing, etc., e ficar fora do container web e o objetivo (nao competir
 * por memoria com o trafego HTTP num transcode 4K pesado).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullmqConnectionFactory,
    }),
    PrismaModule,
    StorageModule,
    MediaModule,
    VideoProcessingWorkerModule,
  ],
})
export class WorkerModule {}
