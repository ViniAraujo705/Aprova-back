import { Module } from '@nestjs/common';
import { ClientFieldsController } from './client-fields.controller';
import { ClientFieldsService } from './client-fields.service';

@Module({
  controllers: [ClientFieldsController],
  providers: [ClientFieldsService],
})
export class ClientFieldsModule {}
