import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateSupplierDirectlyDto {
  @IsString()
  supplierName: string;

  @IsString()
  cnpj: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  responsibleName?: string;

  @IsString()
  @IsOptional()
  companyId?: string; // Usado pelo ADMIN para especificar a empresa do fornecedor
}
