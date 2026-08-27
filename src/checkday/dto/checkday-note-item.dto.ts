import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CheckDayNoteItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  text: string;

  @IsBoolean()
  checked: boolean;

  @IsIn(['check', 'bullet'])
  kind: 'check' | 'bullet';
}
