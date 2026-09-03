import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CheckDayNotesController } from './checkday-notes.controller';
import { CheckDayNotesService } from './checkday-notes.service';

@Module({
  imports: [StorageModule],
  controllers: [CheckDayNotesController],
  providers: [CheckDayNotesService],
})
export class CheckDayNotesModule {}
