import { Module } from '@nestjs/common';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveOAuthService } from './google-drive-oauth.service';
import { GoogleDriveService } from './google-drive.service';

@Module({
  controllers: [GoogleDriveController],
  providers: [GoogleDriveOAuthService, GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
