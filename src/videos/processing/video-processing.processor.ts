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
 * Processa tanto `Video` (vinculado a projeto) quanto `PortfolioVideo`
 * (vitrine da agência, upload dedicado sem projeto) - mesma fila/worker,
 * só muda a tabela lida/gravada (`job.data.kind`). Em caso de falha, marca
 * status_processamento = erro. O original em url_storage permanece sempre
 * disponível.
 */
// Numero de videos processados (download + ffmpeg + upload) em paralelo
// por instancia. ffmpeg roda como child process (nao bloqueia o event
// loop), entao vale subir esse numero conforme CPU/IO disponivel; default
// conservador de 2 para nao competir demais com o trafego HTTP no mesmo
// container. Configuravel via VIDEO_PROCESSING_CONCURRENCY.
const DEFAULT_CONCURRENCY = 2;

@Processor(VIDEO_PROCESSING_QUEUE, {
  concurrency:
    Number(process.env.VIDEO_PROCESSING_CONCURRENCY) || DEFAULT_CONCURRENCY,
})
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
    const { kind, id } = job.data;

    let urlStorage: string;
    let nome: string;
    if (kind === 'video') {
      const video = await this.prisma.video.findUnique({
        where: { id },
        select: { urlStorage: true, nomeArquivo: true },
      });
      if (!video) {
        this.logger.warn(`${kind} ${id} não encontrado; job ignorado.`);
        return;
      }
      urlStorage = video.urlStorage;
      nome = video.nomeArquivo;
    } else {
      const portfolioVideo = await this.prisma.portfolioVideo.findUnique({
        where: { id },
        select: { urlStorage: true, titulo: true },
      });
      if (!portfolioVideo) {
        this.logger.warn(`${kind} ${id} não encontrado; job ignorado.`);
        return;
      }
      // Foto nunca enfileira job (ver PortfoliosService.uploadComplete) -
      // urlStorage só é null aqui se algo enfileirou por engano.
      if (!portfolioVideo.urlStorage) {
        this.logger.warn(
          `${kind} ${id} sem urlStorage (item de foto?); job ignorado.`,
        );
        return;
      }
      urlStorage = portfolioVideo.urlStorage;
      nome = portfolioVideo.titulo;
    }

    const sourceKey = this.storage.keyFromPublicUrl(urlStorage);
    if (!sourceKey) {
      this.logger.error(
        `Não foi possível derivar a key do R2 a partir de ${urlStorage}`,
      );
      await this.markErro(kind, id);
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), 'aprova-video-'));
    const inputPath = join(workDir, 'source');
    const thumbPath = join(workDir, 'thumb.jpg');
    const optimizedPath = join(workDir, 'optimized.mp4');

    try {
      await this.storage.downloadToFile(sourceKey, inputPath);

      const duracaoSegundos = await this.media.getDuration(inputPath);
      await this.media.generateThumbnail(inputPath, thumbPath);
      await this.media.optimizeForWeb(inputPath, optimizedPath);

      const prefix = kind === 'video' ? 'thumbnails' : 'portfolio-thumbnails';
      const optimizedPrefix =
        kind === 'video' ? 'optimized' : 'portfolio-optimized';
      const baseName = nome.replace(/\.[^.]+$/, '');
      // buildKey sanitiza o nome e torna a key unica por execucao: o titulo
      // do video e texto livre (um "VIDEO 01" virava espaco literal na URL
      // publica) e um reprocessamento precisa gerar uma URL nova, senao o
      // CDN continua servindo por um ano o objeto antigo que estava naquela
      // mesma key (ver CacheControl em StorageService.uploadFile).
      const [thumbnailUrl, urlOtimizada] = await Promise.all([
        this.storage.uploadFile(
          this.storage.buildKey(`${id}-${baseName}.jpg`, prefix),
          thumbPath,
          'image/jpeg',
        ),
        this.storage.uploadFile(
          this.storage.buildKey(`${id}-${baseName}.mp4`, optimizedPrefix),
          optimizedPath,
          'video/mp4',
        ),
      ]);

      if (kind === 'video') {
        await this.prisma.video.update({
          where: { id },
          data: {
            thumbnailUrl,
            urlOtimizada,
            duracaoSegundos,
            statusProcessamento: ProcessamentoStatus.pronto,
          },
        });
      } else {
        await this.prisma.portfolioVideo.update({
          where: { id },
          data: {
            posterUrl: thumbnailUrl,
            urlOtimizada,
            duracaoSegundos,
            statusProcessamento: ProcessamentoStatus.pronto,
          },
        });
      }
      this.logger.log(`${kind} ${id} processado com sucesso.`);
    } catch (err) {
      this.logger.error(
        `Falha ao processar ${kind} ${id}: ${(err as Error).message}`,
      );
      await this.markErro(kind, id);
      throw err; // permite o retry configurado na fila
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private async markErro(
    kind: ProcessVideoJobData['kind'],
    id: string,
  ): Promise<void> {
    if (kind === 'video') {
      await this.prisma.video
        .update({
          where: { id },
          data: { statusProcessamento: ProcessamentoStatus.erro },
        })
        .catch(() => undefined);
    } else {
      await this.prisma.portfolioVideo
        .update({
          where: { id },
          data: { statusProcessamento: ProcessamentoStatus.erro },
        })
        .catch(() => undefined);
    }
  }
}
