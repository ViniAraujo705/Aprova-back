import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { sessionMetaFrom } from '../sessions/session-meta.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Cadastra o profissional e cria dados de exemplo (cliente/projeto/vídeo) em background.',
  })
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, sessionMetaFrom(req));
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, sessionMetaFrom(req));
  }

  @Post('google')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login ou cadastro via Google. Recebe o ID token obtido pelo client no sign-in nativo do Google.',
  })
  loginWithGoogle(@Body() dto: GoogleLoginDto, @Req() req: Request) {
    return this.authService.loginWithGoogle(dto, sessionMetaFrom(req));
  }

  @Post('apple')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Login ou cadastro via Apple. Recebe o identityToken obtido pelo client no Sign in with Apple.',
  })
  loginWithApple(@Body() dto: AppleLoginDto, @Req() req: Request) {
    return this.authService.loginWithApple(dto, sessionMetaFrom(req));
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Envia por email um link para redefinir a senha (valido por 1h). Resposta e sempre a mesma, exista ou nao o email.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Redefine a senha a partir do token recebido por email.',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
