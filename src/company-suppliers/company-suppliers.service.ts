/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDirectlyDto } from 'src/company-suppliers/dto/create-company-supplier.dto';

@Injectable()
export class CompanySuppliersService {
  constructor(private prisma: PrismaService) {}

  async createSupplierDirectly(
    companyId: string,
    dto: CreateSupplierDirectlyDto,
  ) {
    // 1. Verificar se fornecedor já existe
    let supplier = await this.prisma.company.findUnique({
      where: { cnpj: dto.cnpj },
    });

    // 2. Criar fornecedor se não existir
    if (!supplier) {
      supplier = await this.prisma.company.create({
        data: {
          name: dto.supplierName,
          cnpj: dto.cnpj,
          email: dto.email,
          phone: dto.phone,
          companyType: 'SUPPLIER',
          plan: 'BASIC',
          status: 'ACTIVE',
        },
      });

      if (dto.responsibleName) {
        await this.prisma.user.create({
          data: {
            email: dto.email,
            passwordHash: '',
            name: dto.responsibleName,
            role: 'SUPPLIER',
            companyId: supplier.id,
            isActive: true,
          },
        });
      }
    }

    // 3. Criar relação
    const relationship = await this.prisma.companySupplier.create({
      data: {
        companyId,
        supplierId: supplier.id,
        status: 'ACTIVE',
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
    });

    return { supplier, relationship };
  }

  async getSuppliersByCompany(companyId: string) {
    return this.prisma.companySupplier.findMany({
      where: { companyId, status: 'ACTIVE' },
      include: { supplier: true },
    });
  }

  async getCompaniesBySupplier(supplierId: string) {
    return this.prisma.companySupplier.findMany({
      where: { supplierId, status: 'ACTIVE' },
      include: { company: true },
    });
  }

  async blockSupplier(companyId: string, supplierId: string) {
    return this.prisma.companySupplier.update({
      where: { companyId_supplierId: { companyId, supplierId } },
      data: { status: 'BLOCKED' },
    });
  }
}
