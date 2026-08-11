import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCrewMemberDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  // Presente quando a pessoa escalada e uma conta real (owner/editor) da
  // mesma agencia — usado pra notifica-la quando escalada (ver
  // NotificationsService.sendRecordingReminders).
  @IsOptional()
  @IsUUID('4', { message: 'userId invalido' })
  userId?: string | null;
}
