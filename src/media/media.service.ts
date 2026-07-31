import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// ffprobe-static expõe { path } com o binário do ffprobe embutido
import * as ffprobeStatic from 'ffprobe-static';

/**
 * Encapsula as operações de ffmpeg usadas no pipeline de processamento
 * de vídeo (thumbnail + versão otimizada). Usa os binários embutidos
 * via ffmpeg-static / ffprobe-static, então não depende de um ffmpeg
 * instalado no sistema.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor() {
    if (ffmpegStatic) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    } else {
      this.logger.warn(
        'ffmpeg-static não resolveu um binário nesta plataforma; o processamento de vídeo pode falhar.',
      );
    }
    if (ffprobeStatic?.path) {
      ffmpeg.setFfprobePath(ffprobeStatic.path);
    }
  }

  /**
   * Extrai um frame do vídeo como thumbnail JPEG (para o preview do
   * WhatsApp / Open Graph). Pega o frame a ~1s (ou no início se o vídeo
   * for mais curto).
   */
  generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .screenshots({
          timestamps: ['1'],
          filename: outputPath.replace(/\\/g, '/').split('/').pop() as string,
          folder: outputPath
            .replace(/\\/g, '/')
            .split('/')
            .slice(0, -1)
            .join('/'),
          size: '640x?',
        });
    });
  }

  /**
   * Extrai a duração do vídeo (em segundos, arredondada) via ffprobe.
   */
  getDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: Error | null, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(Math.round(metadata.format.duration ?? 0));
      });
    });
  }

  /**
   * Gera uma versão comprimida/otimizada para streaming web:
   * H.264 + AAC, limitada a 720p de altura, com moov atom no início
   * (+faststart) para começar a tocar antes do download completo.
   */
  optimizeForWeb(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset veryfast',
          '-crf 26',
          '-movflags +faststart',
          // Reduz para no máximo 720p de altura, mantendo proporção e dimensões pares
          '-vf scale=-2:min(720\\,ih)',
          '-pix_fmt yuv420p',
        ])
        .format('mp4')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }
}
