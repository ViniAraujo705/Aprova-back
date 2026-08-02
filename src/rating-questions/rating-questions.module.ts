import { Module } from '@nestjs/common';
import { RatingQuestionsService } from './rating-questions.service';
import { RatingQuestionsController } from './rating-questions.controller';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [PlansModule],
  controllers: [RatingQuestionsController],
  providers: [RatingQuestionsService],
  exports: [RatingQuestionsService],
})
export class RatingQuestionsModule {}
