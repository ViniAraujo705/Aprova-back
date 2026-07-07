import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RatingQuestionsService } from './rating-questions.service';
import { CreateRatingQuestionDto } from './dto/create-rating-question.dto';
import { UpdateRatingQuestionDto } from './dto/update-rating-question.dto';

@ApiTags('rating-questions')
@ApiBearerAuth()
@Controller('rating-questions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RatingQuestionsController {
  constructor(
    private readonly ratingQuestionsService: RatingQuestionsService,
  ) {}

  @Get()
  @Roles(UserRole.owner, UserRole.editor)
  findAll(@CurrentUser() user: AuthUser) {
    return this.ratingQuestionsService.findAll(user.accountId);
  }

  @Post()
  @Roles(UserRole.owner)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRatingQuestionDto,
  ) {
    return this.ratingQuestionsService.create(user.accountId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.owner)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRatingQuestionDto,
  ) {
    return this.ratingQuestionsService.update(user.accountId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.owner)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.ratingQuestionsService.remove(user.accountId, id);
  }
}
