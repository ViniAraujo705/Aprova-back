import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email invalido' })
  email?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  fotoUrl?: string;

  @IsOptional()
  @IsObject()
  camposPersonalizados?: Prisma.InputJsonObject;
}
