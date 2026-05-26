import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBatchDto {
  @IsString()
  batchId: string;

  @IsString()
  productName: string;

  @IsString()
  @IsOptional()
  productDescription?: string;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;
}
