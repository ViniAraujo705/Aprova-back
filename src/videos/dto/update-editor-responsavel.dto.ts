import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateEditorResponsavelDto {
  @IsArray({ message: 'editorIds deve ser uma lista' })
  @ArrayUnique({ message: 'editorIds nao pode conter ids repetidos' })
  @IsUUID('4', { each: true, message: 'editorIds contem id invalido' })
  editorIds: string[];
}
