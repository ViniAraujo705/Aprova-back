import { Module } from '@nestjs/common';
import { RatingQuestionsService } from './rating-questions.service';
import { RatingQuestionsController } from './rating-questions.controller';

@Module({
  controllers: [RatingQuestionsController],
  providers: [RatingQuestionsService],
  exports: [RatingQuestionsService],
})
export class RatingQuestionsModule {}
