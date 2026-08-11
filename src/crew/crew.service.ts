import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCrewMemberDto } from './dto/create-crew-member.dto';

@Injectable()
export class CrewService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, dto: CreateCrewMemberDto) {
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: dto.userId,
          accountId,
          role: { in: [UserRole.owner, UserRole.editor] },
        },
        select: { id: true },
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
}
