import { ApiProperty } from '@nestjs/swagger';

export class GoogleCalendarStatusDto {
  @ApiProperty()
  connected: boolean;

  @ApiProperty({ nullable: true, type: String })
  googleEmail: string | null;
}
