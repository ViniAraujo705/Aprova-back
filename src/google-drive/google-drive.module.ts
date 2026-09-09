import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
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
  ],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveOAuthService, GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
