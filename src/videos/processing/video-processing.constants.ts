// Nome da fila BullMQ para o processamento assíncrono de vídeo
export const VIDEO_PROCESSING_QUEUE = 'video-processing';

// Nome do job de processamento (thumbnail + versão otimizada)
export const PROCESS_VIDEO_JOB = 'process-video';

// BullMQ: menor numero = maior prioridade. Contas no plano Agencia
// processam antes das demais (ver PlansService/PLAN_LIMITS.priorityQueue).
export const VIDEO_PROCESSING_PRIORITY_DEFAULT = 10;
export const VIDEO_PROCESSING_PRIORITY_HIGH = 1;

// Mesma fila/worker processa tanto Video (vinculado a projeto) quanto
// PortfolioVideo (vitrine da agencia, upload dedicado sem projeto) - o
// job so precisa saber em qual tabela ler/gravar o resultado.
export type ProcessableVideoKind = 'video' | 'portfolioVideo';

export interface ProcessVideoJobData {
  kind: ProcessableVideoKind;
  id: string;
}
