import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { CheckDayNoteItemDto } from './checkday-note-item.dto';

export class CreateCheckDayNoteDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckDayNoteItemDto)
  items?: CheckDayNoteItemDto[];

  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
