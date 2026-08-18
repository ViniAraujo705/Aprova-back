import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';

@Module({
  imports: [
    // AuthModule nao exporta seu JwtService - registra um proprio aqui so
    // pra assinar/validar o `state` do callback OAuth (mesmo JWT_SECRET).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [GoogleCalendarController],
  providers: [GoogleCalendarOAuthService, GoogleCalendarSyncService],
  exports: [GoogleCalendarSyncService],
})
export class GoogleCalendarModule {}
