import { ConfigService } from '@nestjs/config';
import { QueueBaseOptions } from 'bullmq';

/**
 * Config de conexao do Redis usada pelo BullMQ, compartilhada entre o
 * processo web (produtor: enfileira jobs) e o processo worker (consumidor:
 * roda o VideoProcessingProcessor). Mantida num unico lugar pra evitar que
 * os dois processos divirjam na config de conexao.
 */
export function bullmqConnectionFactory(
  config: ConfigService,
): QueueBaseOptions {
  return {
    connection: {
      host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
      port: config.get<number>('REDIS_PORT') ?? 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      // Exigido pelo BullMQ ao usar workers/blocking commands
      maxRetriesPerRequest: null,
    },
  };
}
