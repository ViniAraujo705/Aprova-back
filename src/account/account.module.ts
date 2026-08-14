import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { SessionsModule } from '../sessions/sessions.module';
import { PlansModule } from '../plans/plans.module';
import type { StringValue } from 'ms';

@Module({
  imports: [
    SessionsModule,
    PlansModule,
    // Mesma config do AuthModule: o aceite de convite emite um token de
    // login para o editor recem-criado.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '7d') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
