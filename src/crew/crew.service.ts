import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCrewMemberDto } from './dto/create-crew-member.dto';

@Injectable()
export class CrewService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, dto: CreateCrewMemberDto) {
    if (dto.userId) {
      const user = await this.prisma.membership.findFirst({
        where: {
          userId: dto.userId,
          accountId,
          role: { in: [UserRole.owner, UserRole.editor] },
        },
        select: { userId: true },
      });
      if (!user) {
        throw new BadRequestException('userId invalido');
      }
    }

    return this.prisma.crewMember.create({
      data: { nome: dto.nome, accountId, userId: dto.userId ?? null },
    });
  }

  findAll(accountId: string) {
    return this.prisma.crewMember.findMany({
      where: { accountId },
      orderBy: { nome: 'asc' },
    });
  }

  async remove(accountId: string, id: string) {
    // Escopado por conta: id de outra conta responde 404, sem vazar que existe.
    const { count } = await this.prisma.crewMember.deleteMany({
      where: { id, accountId },
    });
    if (count === 0) {
      throw new NotFoundException('Pessoa nao encontrada');
    }
    return { deleted: true };
  }
}
