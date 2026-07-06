import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { MediaModule } from './media/media.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { VideosModule } from './videos/videos.module';
import { PublicModule } from './public/public.module';
import { AdminModule } from './admin/admin.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { AccountModule } from './account/account.module';
import { CommentsModule } from './comments/comments.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (protege login e rotas publicas contra abuso).
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
    // Fila assíncrona (BullMQ + Redis) usada no processamento de vídeo.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: config.get<number>('REDIS_PORT') ?? 6379,
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          // Exigido pelo BullMQ ao usar workers/blocking commands
          maxRetriesPerRequest: null,
        },
      }),
    }),
    PrismaModule,
    StorageModule,
    MediaModule,
    AuthModule,
    ClientsModule,
    ProjectsModule,
    VideosModule,
    PublicModule,
    AdminModule,
    DashboardModule,
    UsersModule,
    AccountModule,
    CommentsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
