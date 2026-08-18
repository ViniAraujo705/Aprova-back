import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LinkGoogleDriveItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  googleFileId: string;
}
