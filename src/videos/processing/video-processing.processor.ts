import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, rm } from 'fs/promises';
import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ProcessamentoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { MediaService } from '../../media/media.service';
import {
  ProcessVideoJobData,
  VIDEO_PROCESSING_QUEUE,
} from './video-processing.constants';

/**
 * Worker que processa o vídeo em background:
 * 1. baixa o original do R2 (o upload vai direto do browser pro bucket,
 *    então o binário não passa pela rota HTTP);
 * 2. extrai uma thumbnail (preview do WhatsApp / Open Graph);
 * 3. gera uma versão otimizada para streaming web;
 * 4. sobe ambos no R2 e atualiza o vídeo (status_processamento = pronto).
 *
 * Em caso de falha, marca status_processamento = erro. O original em
 * url_storage permanece sempre disponível.
 */
@Processor(VIDEO_PROCESSING_QUEUE)
export class VideoProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {
    super();
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    const { videoId } = job.data;

    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true, urlStorage: true, nomeArquivo: true },
    });
    if (!video) {
      this.logger.warn(`Vídeo ${videoId} não encontrado; job ignorado.`);
      return;
    }

    const sourceKey = this.storage.keyFromPublicUrl(video.urlStorage);
    if (!sourceKey) {
      this.logger.error(
        `Não foi possível derivar a key do R2 a partir de ${video.urlStorage}`,
      );
      await this.markErro(videoId);
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), 'aprova-video-'));
    const inputPath = join(workDir, 'source');
    const thumbPath = join(workDir, 'thumb.jpg');
    const optimizedPath = join(workDir, 'optimized.mp4');

    try {
      await this.storage.downloadToFile(sourceKey, inputPath);

      await this.media.generateThumbnail(inputPath, thumbPath);
      await this.media.optimizeForWeb(inputPath, optimizedPath);

      const baseName = video.nomeArquivo.replace(/\.[^.]+$/, '');
      const [thumbnailUrl, urlOtimizada] = await Promise.all([
        this.storage.uploadFile(
          `thumbnails/${videoId}-${baseName}.jpg`,
          thumbPath,
          'image/jpeg',
        ),
        this.storage.uploadFile(
          `optimized/${videoId}-${baseName}.mp4`,
          optimizedPath,
          'video/mp4',
        ),
      ]);

      await this.prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnailUrl,
          urlOtimizada,
          statusProcessamento: ProcessamentoStatus.pronto,
        },
      });
      this.logger.log(`Vídeo ${videoId} processado com sucesso.`);
    } catch (err) {
      this.logger.error(
        `Falha ao processar vídeo ${videoId}: ${(err as Error).message}`,
      );
      await this.markErro(videoId);
      throw err; // permite o retry configurado na fila
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async markErro(videoId: string): Promise<void> {
    await this.prisma.video
      .update({
        where: { id: videoId },
        data: { statusProcessamento: ProcessamentoStatus.erro },
      })
      .catch(() => undefined);
  }
}
