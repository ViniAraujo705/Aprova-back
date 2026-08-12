import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

// Entrypoint do processo worker: so consome a fila de processamento de
// video (ffmpeg), sem servidor HTTP. Deploy como um servico Railway a
// parte (start command: node dist/main-worker), com sua propria RAM/CPU,
// separado do servico web (dist/main). Ver src/worker.module.ts.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Worker de processamento de video rodando.', 'Bootstrap');
}
bootstrap();
