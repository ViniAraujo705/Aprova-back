import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCrewMemberDto } from './dto/create-crew-member.dto';

@Injectable()
export class CrewService {
  constructor(private readonly prisma: PrismaService) {}

  create(accountId: string, dto: CreateCrewMemberDto) {
    return this.prisma.crewMember.create({
      data: { nome: dto.nome, accountId },
    });
  }

  findAll(accountId: string) {
    return this.prisma.crewMember.findMany({
      where: { accountId },
      orderBy: { nome: 'asc' },
    });
  }
}
