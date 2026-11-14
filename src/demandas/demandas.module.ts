import { Module } from '@nestjs/common';
import { DemandasService } from './demandas.service';
import { DemandasController } from './demandas.controller';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [DemandasController],
  providers: [DemandasService],
})
export class DemandasModule {}
