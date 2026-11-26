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
  async generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
    const { video, duration } = await this.probeStreams(inputPath);
    const seek = duration > 1 ? 1 : 0;
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(seek)
        .outputOptions([
          // Mapeia só a trilha de vídeo decodificável: vídeos recentes do
          // iPhone trazem trilhas extras (metadados/áudio espacial) sem
          // decoder no ffmpeg, e a seleção automática quebrava o processamento.
          `-map 0:${video ?? 'v:0'}`,
          '-frames:v 1',
          '-vf scale=640:-2',
          '-q:v 3',
        ])
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }

  /**
   * Descobre as trilhas que o ffmpeg consegue decodificar: a primeira de vídeo
   * (ignorando capas embutidas) e a primeira de áudio com codec conhecido.
   * Trilhas com `codec_name` ausente (ex.: metadados do iPhone) ficam de fora.
   */
  probeStreams(
    inputPath: string,
  ): Promise<{ video: number | null; audio: number | null; duration: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err: Error | null, metadata) => {
        if (err) {
          reject(err);
          return;
        }
        // fluent-ffmpeg devolve 'unknown' quando o ffprobe não informa codec.
        const known = metadata.streams.filter(
          (s) => s.codec_name && !['none', 'unknown'].includes(s.codec_name),
        );
        const video = known.find(
          (s) => s.codec_type === 'video' && !s.disposition?.attached_pic,
        );
        const audio = known.find((s) => s.codec_type === 'audio');
        resolve({
          video: video?.index ?? null,
          audio: audio?.index ?? null,
          duration: Number(metadata.format.duration ?? 0),
        });
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
  async optimizeForWeb(inputPath: string, outputPath: string): Promise<void> {
    const { video, audio } = await this.probeStreams(inputPath);
    const maps = [`-map 0:${video ?? 'v:0'}`, audio === null ? '-an' : `-map 0:${audio}`];
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
          '-vf scale=if(gt(iw\\,ih)\\,-2\\,min(1080\\,iw)):if(gt(iw\\,ih)\\,min(1080\\,ih)\\,-2)',
          '-pix_fmt yuv420p',
          ...maps,
        ])
        .format('mp4')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
  }
}
