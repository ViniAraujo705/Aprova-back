import { Module } from '@nestjs/common';
import { QuadrosController } from './quadros.controller';
import { QuadrosService } from './quadros.service';

@Module({
  controllers: [QuadrosController],
  providers: [QuadrosService],
})
export class QuadrosModule {}
