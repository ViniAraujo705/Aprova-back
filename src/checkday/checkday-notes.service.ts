import { Injectable, NotFoundException } from '@nestjs/common';
import { CheckDayNote, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCheckDayNoteDto } from './dto/create-checkday-note.dto';
import { UpdateCheckDayNoteDto } from './dto/update-checkday-note.dto';
import { CheckDayImageUploadUrlDto } from './dto/checkday-image-upload-url.dto';

@Injectable()
export class CheckDayNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll(accountId: string) {
    const notes = await this.prisma.checkDayNote.findMany({
      where: { accountId },
      orderBy: { updatedAt: 'desc' },
    });
    return notes.map((note) => this.toResponse(note));
  }

  async create(
    accountId: string,
    authorId: string,
    dto: CreateCheckDayNoteDto,
  ) {
    const note = await this.prisma.checkDayNote.create({
      data: {
        accountId,
        authorId,
        title: dto.title,
        body: dto.body ?? null,
        items: (dto.items ?? []) as unknown as Prisma.InputJsonValue,
        imageUrl: dto.imageUrl ?? null,
      },
    });
    return this.toResponse(note);
  }

  async update(accountId: string, id: string, dto: UpdateCheckDayNoteDto) {
    await this.getOwned(accountId, id);
    const note = await this.prisma.checkDayNote.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.items !== undefined && {
          items: dto.items as unknown as Prisma.InputJsonValue,
        }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      },
    });
    return this.toResponse(note);
  }

  async remove(accountId: string, id: string) {
    await this.getOwned(accountId, id);
    const note = await this.prisma.checkDayNote.delete({ where: { id } });
    return this.toResponse(note);
  }

  createImageUploadUrl(dto: CheckDayImageUploadUrlDto) {
    return this.storage.createPresignedUploadIn(
      'checkday',
      dto.nomeArquivo,
      dto.contentType,
    );
  }

  private async getOwned(accountId: string, id: string) {
    const note = await this.prisma.checkDayNote.findFirst({
      where: { id, accountId },
    });
    if (!note) {
      throw new NotFoundException('Nota do CheckDay nao encontrada');
    }
    return note;
  }

  private toResponse(note: CheckDayNote) {
    return {
      id: note.id,
      accountId: note.accountId,
      authorId: note.authorId,
      title: note.title,
      body: note.body,
      items: Array.isArray(note.items) ? note.items : [],
      imageUrl: note.imageUrl,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }
}
