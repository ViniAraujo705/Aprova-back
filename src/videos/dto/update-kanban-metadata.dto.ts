import { ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

// Os arrays substituem integralmente as associacoes atuais; [] limpa tudo.
export class UpdateKanbanMetadataDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true, message: 'labelIds deve conter UUIDs validos' })
  labelIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'collaboratorIds deve conter UUIDs validos',
  })
  collaboratorIds?: string[];
}
