import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';
import { VideosModule } from '../videos/videos.module';
import { PlansModule } from '../plans/plans.module';
import { GOOGLE_DRIVE_IMPORT_QUEUE } from './import/google-drive-import.constants';
import { GoogleDriveImportService } from './import/google-drive-import.service';
import { GoogleDriveImportProcessor } from './import/google-drive-import.processor';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';
import { GoogleDriveService } from './google-drive.service';

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
    BullModule.registerQueue({ name: GOOGLE_DRIVE_IMPORT_QUEUE }),
    VideosModule,
    PlansModule,
  ],
  controllers: [GoogleDriveController],
  providers: [
    GoogleDriveOAuthService,
    GoogleDriveService,
    GoogleDriveImportService,
    GoogleDriveImportProcessor,
  ],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
