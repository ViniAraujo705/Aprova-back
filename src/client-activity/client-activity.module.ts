import { Module } from '@nestjs/common';
import { ClientActivityService } from './client-activity.service';

@Module({
  providers: [ClientActivityService],
  exports: [ClientActivityService],
})
export class ClientActivityModule {}
