import { Injectable } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import * as ffprobeStatic from 'ffprobe-static';

/**
 * Encapsula as operações de ffmpeg usadas no pipeline de processamento
 * de vídeo (thumbnail + versão otimizada). Usa binários embutidos com licença
 * LGPL/MIT; FFMPEG_PATH e FFPROBE_PATH permitem sobrescrever os caminhos.
 */
@Injectable()
export class MediaService {
  constructor() {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH ?? ffmpegInstaller.path);
    ffmpeg.setFfprobePath(process.env.FFPROBE_PATH ?? ffprobeStatic.path);
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
   * H.264 High + AAC, limitada a 1080px no lado MENOR (sem upscale). Assim
   * um vídeo vertical 4K vira 1080x1920, e não 406x720; o moov atom fica no
   * início (+faststart) para começar a tocar antes do download completo.
   */
  optimizeForWeb(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset medium',
          '-crf 20',
          '-profile:v high',
          '-b:a 192k',
          '-movflags +faststart',
          // Limita a menor dimensão a 1080px, sem ampliar fontes menores.
          // -2 preserva a proporção e força a dimensão calculada a ser par.
          '-vf scale=if(gt(iw\\,ih)\\,-2\\,min(1080\\,ih)):if(gt(iw\\,ih)\\,min(1080\\,iw)\\,-2)',
          '-pix_fmt yuv420p',
        ])
        .format('mp4')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }
}
