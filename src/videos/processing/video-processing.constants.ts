// Nome da fila BullMQ para o processamento assíncrono de vídeo
export const VIDEO_PROCESSING_QUEUE = 'video-processing';

// Nome do job de processamento (thumbnail + versão otimizada)
export const PROCESS_VIDEO_JOB = 'process-video';

export interface ProcessVideoJobData {
  videoId: string;
}
