import { Module } from '@nestjs/common';
import { ClientFilesService } from './client-files.service';
import { ClientFilesController } from './client-files.controller';
import { ClientActivityModule } from '../client-activity/client-activity.module';

@Module({
  imports: [ClientActivityModule],
  controllers: [ClientFilesController],
  providers: [ClientFilesService],
})
export class ClientFilesModule {}
