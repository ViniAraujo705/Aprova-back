import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Transform } from 'stream';
import { StorageService } from '../../storage/storage.service';
import { VideosService } from '../../videos/videos.service';
import { GoogleDriveOAuthService } from '../google-drive-oauth.service';
import { GoogleDriveImportService } from './google-drive-import.service';
import {
  GOOGLE_DRIVE_IMPORT_QUEUE,
  GoogleDriveImportJobData,
  GoogleDriveImportJobResult,
} from './google-drive-import.constants';

/**
 * Executa o import: Drive (stream) -> R2 (multipart), sem disco e sem
 * carregar o arquivo em memoria; depois registra o video pelo fluxo normal.
 * Roda no processo web, como o processamento de video hoje (ver comentario
 * em VideosModule) - o trabalho e so I/O, nao disputa CPU com o ffmpeg.
 */
@Processor(GOOGLE_DRIVE_IMPORT_QUEUE, {
  concurrency: Number(process.env.GOOGLE_DRIVE_IMPORT_CONCURRENCY) || 2,
})
export class GoogleDriveImportProcessor extends WorkerHost {
  private readonly logger = new Logger(GoogleDriveImportProcessor.name);

  constructor(
    private readonly imports: GoogleDriveImportService,
    private readonly oauth: GoogleDriveOAuthService,
    private readonly storage: StorageService,
    private readonly videos: VideosService,
  ) {
    super();
  }

  async process(
    job: Job<GoogleDriveImportJobData, GoogleDriveImportJobResult>,
  ): Promise<GoogleDriveImportJobResult> {
    const data = job.data;
    // Token novo aqui: o job pode esperar na fila mais que a validade (1h).
    const accessToken = await this.imports.accessTokenFor(data.user.id);
    const source = await this.oauth.openDownloadStream(
      accessToken,
      data.googleFileId,
    );

    // Progresso pelo que JA SAIU do Drive (o Drive informa o tamanho; sem
    // ele, o progresso fica parado e o front mostra so "importando").
    let read = 0;
    let lastReported = -1;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        read += chunk.length;
        cb(null, chunk);
      },
    });
    source.on('error', (err) => counter.destroy(err));
    const body = source.pipe(counter);
    const reportProgress = () => {
      if (!data.sizeBytes) return;
      // Ate 95%: o resto e o registro do video.
      const pct = Math.min(95, Math.floor((read / data.sizeBytes) * 95));
      if (pct !== lastReported) {
        lastReported = pct;
        void job.updateProgress(pct).catch(() => undefined);
      }
    };

    const key = this.storage.buildKey(data.nomeArquivo);
    const publicUrl = await this.storage.uploadStream(
      key,
      body,
      data.mimeType,
      reportProgress,
    );

    try {
      const video = await this.videos.create(
        data.accountId,
        {
          projectId: data.projectId,
          urlStorage: publicUrl,
          nomeArquivo: data.nomeArquivo,
        },
        data.user,
      );
      await job.updateProgress(100).catch(() => undefined);
      this.logger.log(`Import do Drive concluido: video ${video.id}`);
      return { videoId: video.id };
    } catch (err) {
      // Sem video registrado o objeto ficaria orfao no bucket.
      await this.storage.deleteObject(key).catch(() => undefined);
      throw err;
    }
  }
}
