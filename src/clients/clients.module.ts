import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { PlansModule } from '../plans/plans.module';
import { ClientActivityModule } from '../client-activity/client-activity.module';

@Module({
  imports: [PlansModule, ClientActivityModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
