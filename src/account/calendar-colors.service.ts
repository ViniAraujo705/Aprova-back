import { Injectable } from '@nestjs/common';
import { Prisma, RecordingEventTipo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCalendarColorsDto } from './dto/update-calendar-colors.dto';

/** `{ [tipo]: '#hex' }` - so os tipos personalizados; o resto usa o padrao. */
export type CalendarColors = Partial<Record<RecordingEventTipo, string>>;

const TIPOS = Object.values(RecordingEventTipo);

/**
 * Cores dos tipos de evento do calendario, por conta (o calendario e
 * compartilhado pela equipe). Guardadas em Account.coresCalendario (JSON).
 */
@Injectable()
export class CalendarColorsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(accountId: string): Promise<CalendarColors> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { coresCalendario: true },
    });
    return this.sanitize(account.coresCalendario);
  }

  async update(
    accountId: string,
    dto: UpdateCalendarColorsDto,
  ): Promise<CalendarColors> {
    const current = await this.get(accountId);
    const next: CalendarColors = { ...current };
    for (const tipo of TIPOS) {
      const value = dto[tipo];
      if (value === undefined) continue;
      if (value === null) delete next[tipo];
      else next[tipo] = value;
    }
    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        coresCalendario: Object.keys(next).length
          ? (next as Prisma.InputJsonObject)
          : Prisma.DbNull,
      },
    });
    return next;
  }

  /** Descarta qualquer chave/valor fora do formato (JSON veio do banco). */
  private sanitize(raw: Prisma.JsonValue | null): CalendarColors {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: CalendarColors = {};
    for (const tipo of TIPOS) {
      const value = (raw as Record<string, unknown>)[tipo];
      if (typeof value === 'string') out[tipo] = value;
    }
    return out;
  }
}
