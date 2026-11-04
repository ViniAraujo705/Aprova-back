import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Armazena os contadores do Throttler no Redis, em vez de mantê-los na
 * memória de cada processo web. Assim, o limite continua valendo quando a
 * API roda em mais de uma réplica.
 *
 * Em uma indisponibilidade transitória do Redis, o limite falha aberto para
 * não transformar esse serviço auxiliar em indisponibilidade total da API.
 * A conexão também é usada pela fila de vídeo, que deve ser monitorada.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
      port: config.get<number>('REDIS_PORT') ?? 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (error) => {
      this.logger.error(`Redis indisponível para rate limit: ${error.message}`);
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttler:${key}:hits`;
    const blockKey = `throttler:${key}:block`;

    try {
      const result = (await this.client.eval(
        `
          local blockTtl = redis.call('PTTL', KEYS[2])
          if blockTtl > 0 then
            local hits = tonumber(redis.call('GET', KEYS[1])) or 0
            return { hits, redis.call('PTTL', KEYS[1]), 1, blockTtl }
          end

          local hits = redis.call('INCR', KEYS[1])
          if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
          local hitsTtl = redis.call('PTTL', KEYS[1])

          if hits > tonumber(ARGV[2]) then
            redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
            redis.call('PEXPIRE', KEYS[1], ARGV[3])
            return { hits, tonumber(ARGV[3]), 1, tonumber(ARGV[3]) }
          end

          return { hits, hitsTtl, 0, 0 }
        `,
        2,
        hitsKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];

      return {
        totalHits: Number(result[0]),
        timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
        isBlocked: result[2] === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
      };
    } catch (error) {
      this.logger.error(
        `Falha ao consultar Redis para rate limit: ${(error as Error).message}`,
      );
      return {
        totalHits: 1,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
