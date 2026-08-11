import { Module } from '@nestjs/common';
import { DemandasService } from './demandas.service';
import { DemandasController } from './demandas.controller';

@Module({
  controllers: [DemandasController],
  providers: [DemandasService],
})
export class DemandasModule {}
