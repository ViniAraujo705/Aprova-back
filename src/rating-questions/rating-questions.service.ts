import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingQuestionDto } from './dto/create-rating-question.dto';
import { UpdateRatingQuestionDto } from './dto/update-rating-question.dto';

@Injectable()
export class RatingQuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(accountId: string) {
    return this.prisma.ratingQuestion.findMany({
      where: { accountId },
      orderBy: { ordem: 'asc' },
    });
  }

  async create(accountId: string, dto: CreateRatingQuestionDto) {
    // Nova pergunta entra no fim da lista (maior ordem + 1).
    const last = await this.prisma.ratingQuestion.findFirst({
      where: { accountId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });
    return this.prisma.ratingQuestion.create({
      data: { accountId, texto: dto.texto, ordem: (last?.ordem ?? -1) + 1 },
    });
  }

  async update(accountId: string, id: string, dto: UpdateRatingQuestionDto) {
    await this.assertOwned(accountId, id);
    return this.prisma.ratingQuestion.update({
      where: { id },
      data: dto,
    });
  }

  async remove(accountId: string, id: string) {
    await this.assertOwned(accountId, id);
    const emUso = await this.prisma.rating.count({
      where: { ratingQuestionId: id },
    });
    if (emUso > 0) {
      throw new ConflictException(
        'Nao e possivel excluir uma pergunta com avaliacoes associadas. Desative-a (ativo: false) em vez de excluir.',
      );
    }
    await this.prisma.ratingQuestion.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertOwned(accountId: string, id: string) {
    const question = await this.prisma.ratingQuestion.findFirst({
      where: { id, accountId },
      select: { id: true },
    });
    if (!question) {
      throw new NotFoundException('Pergunta de avaliacao nao encontrada');
    }
  }
}
