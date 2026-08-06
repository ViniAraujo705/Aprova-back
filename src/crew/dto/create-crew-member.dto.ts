import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCrewMemberDto {
  @IsString()
  @IsNotEmpty()
  nome: string;
}
