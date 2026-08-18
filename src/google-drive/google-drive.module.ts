import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';
import { GoogleDriveService } from './google-drive.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveOAuthService, GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
