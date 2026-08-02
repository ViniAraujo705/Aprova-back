import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  PROCESS_VIDEO_JOB,
  ProcessVideoJobData,
  VIDEO_PROCESSING_PRIORITY_DEFAULT,
  VIDEO_PROCESSING_QUEUE,
} from './video-processing.constants';

/**
 * Enfileira o processamento assíncrono de um vídeo (thumbnail + versão
 * otimizada). Se o Redis estiver indisponível, apenas registra o erro:
 * o vídeo continua utilizável na versão original e o status permanece
 * `processando` até um novo disparo — o registro do vídeo nunca falha
 * por causa da fila.
 */
@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly queue: Queue<ProcessVideoJobData>,
  ) {}

  async enqueue(
    videoId: string,
    priority: number = VIDEO_PROCESSING_PRIORITY_DEFAULT,
  ): Promise<void> {
    try {
      await this.queue.add(
        PROCESS_VIDEO_JOB,
        { videoId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 100,
          priority,
        },
      );
    } catch (err) {
      this.logger.error(
        `Não foi possível enfileirar o processamento do vídeo ${videoId}: ${
          (err as Error).message
        }`,
      );
    }
  }
}
