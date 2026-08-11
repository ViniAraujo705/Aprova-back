import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { MediaModule } from './media/media.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { VideosModule } from './videos/videos.module';
import { PortfoliosModule } from './portfolios/portfolios.module';
import { PortfolioCategoriesModule } from './portfolio-categories/portfolio-categories.module';
import { PortfolioProfileModule } from './portfolio-profile/portfolio-profile.module';
import { PublicModule } from './public/public.module';
import { AdminModule } from './admin/admin.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { UsersModule } from './users/users.module';
import { AccountModule } from './account/account.module';
import { CommentsModule } from './comments/comments.module';
import { HealthModule } from './health/health.module';
import { RatingQuestionsModule } from './rating-questions/rating-questions.module';
import { TeamModule } from './team/team.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlansModule } from './plans/plans.module';
import { BillingModule } from './billing/billing.module';
import { RecordingEventsModule } from './recording-events/recording-events.module';
import { CrewModule } from './crew/crew.module';
import { DemandasModule } from './demandas/demandas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Cron dos lembretes de gravacao (NotificationsService.sendRecordingReminders).
    ScheduleModule.forRoot(),
    // Rate limiting global (protege login e rotas publicas contra abuso).
    // Limite elevado de 60 -> 120/min: navegacao normal do dashboard
    // (varios GETs autenticados em sequencia: videos, projetos, comentarios,
    // ratings) estava esbarrando no limite anterior sem nenhum abuso.
    // Rotas sensiveis (login, reset de senha etc.) tem limites proprios e
    // mais restritivos via @Throttle nos respectivos controllers.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
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
    MailModule,
    MediaModule,
    AuthModule,
    ClientsModule,
    ProjectsModule,
    VideosModule,
    PortfoliosModule,
    PortfolioCategoriesModule,
    PortfolioProfileModule,
    PublicModule,
    AdminModule,
    DashboardModule,
    UsersModule,
    AccountModule,
    CommentsModule,
    HealthModule,
    RatingQuestionsModule,
    TeamModule,
    NotificationsModule,
    PlansModule,
    BillingModule,
    RecordingEventsModule,
    CrewModule,
    DemandasModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
