import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListGoogleDriveItemsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pageToken?: string;
}
