import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingService } from './onboarding.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { toMemberDto } from '../common/dto/team-role.util';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly onboarding: OnboardingService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ja existe uma conta com este email');
    }

    const senhaHash = await bcrypt.hash(dto.senha, this.SALT_ROUNDS);

    // Cadastro cria a agencia (Account) + o usuario dono (owner) juntos.
    // Cada agencia comeca com um unico owner; editores entram via convite.
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senha: senhaHash,
        role: UserRole.owner,
        account: {
          create: { nomeAgencia: dto.nomeAgencia ?? dto.nome },
        },
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        status: true,
        accountId: true,
        criadoEm: true,
      },
    });

    // Popula dados de exemplo em background (não bloqueia o cadastro).
    // OnboardingService.seedExampleData nunca lança — trata o próprio erro.
    void this.onboarding.seedExampleData(user.accountId);

    return {
      user: toMemberDto(user),
      access_token: this.signToken(
        user.id,
        user.email,
        user.role,
        user.accountId,
      ),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.senha, user.senha))) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (user.status === 'suspenso') {
      throw new ForbiddenException(
        'Conta suspensa. Entre em contato com o administrador.',
      );
    }

    return {
      user: toMemberDto({
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        status: user.status,
        accountId: user.accountId,
        criadoEm: user.criadoEm,
      }),
      access_token: this.signToken(
        user.id,
        user.email,
        user.role,
        user.accountId,
      ),
    };
  }

  private signToken(
    sub: string,
    email: string,
    role: UserRole,
    accountId: string,
  ): string {
    return this.jwt.sign({ sub, email, role, accountId });
  }
}
