import { IsOptional, IsUUID } from 'class-validator';

export class UpdateEditorResponsavelDto {
  @IsOptional()
  @IsUUID('4', { message: 'editorId invalido' })
  editorId: string | null;
}
