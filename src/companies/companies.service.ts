/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import * as bcrypt from 'bcryptjs'; // Adicione no topo do arquivo
import { CreateCompanyWithManagerDto } from 'src/companies/dto/create-company-with-manager.dto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({
      where: { cnpj: data.cnpj },
    });
    if (existing) throw new Error('CNPJ já cadastrado');

    return this.prisma.company.create({
      data: {
        name: data.name,
        cnpj: data.cnpj,
        email: data.email,
        phone: data.phone,
        companyType: data.companyType,
        plan: data.plan,
      },
    });
  }

  async findAll() {
    return this.prisma.company.findMany({
      include: { users: true, batches: { take: 5 } },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { users: true, suppliersTo: { include: { supplier: true } } },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  async update(id: string, data: Partial<CreateCompanyDto>) {
    return this.prisma.company.update({ where: { id }, data });
  }

  async getDashboardStats(companyId: string) {
    const [totalBatches, compliantBatches, totalCO2, totalSuppliers] =
      await Promise.all([
        this.prisma.batch.count({ where: { companyId } }),
        this.prisma.batch.count({ where: { companyId, isCompliant: true } }),
        this.prisma.batch.aggregate({
          where: { companyId },
          _sum: { co2Emitted: true },
        }),
        this.prisma.companySupplier.count({
          where: { companyId, status: 'ACTIVE' },
        }),
      ]);

    return {
      totalBatches,
      compliantRate:
        totalBatches > 0 ? (compliantBatches / totalBatches) * 100 : 0,
      totalCO2: totalCO2._sum.co2Emitted || 0,
      totalSuppliers,
    };
  }

  async createCompanyWithManager(data: CreateCompanyWithManagerDto) {
    // 1. Verificar se CNPJ já existe
    const existingCompany = await this.prisma.company.findUnique({
      where: { cnpj: data.companyCnpj },
    });
    if (existingCompany) {
      throw new Error('CNPJ já cadastrado');
    }

    // 2. Verificar se email do gerente já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.managerEmail },
    });
    if (existingUser) {
      throw new Error('E-mail do gerente já cadastrado');
    }

    // 3. Criar empresa
    const company = await this.prisma.company.create({
      data: {
        name: data.companyName,
        cnpj: data.companyCnpj,
        email: data.companyEmail,
        phone: data.companyPhone,
        companyType: 'CLIENT',
        plan: data.plan,
        status: 'ACTIVE',
      },
    });

    // 4. Criar gerente (usuário MANAGER)
    const hashedPassword = await bcrypt.hash(data.managerPassword, 10);
    const manager = await this.prisma.user.create({
      data: {
        name: data.managerName,
        email: data.managerEmail,
        passwordHash: hashedPassword,
        role: 'MANAGER',
        companyId: company.id,
        isActive: true,
      },
    });

    // 5. Criar métricas iniciais
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    await this.prisma.metric.upsert({
      where: {
        companyId_periodType_periodDate: {
          companyId: company.id,
          periodType: 'MONTH',
          periodDate: startOfMonth,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        periodType: 'MONTH',
        periodDate: startOfMonth,
        totalBatches: 0,
        totalCo2Emitted: 0,
        totalSuppliers: 0,
        activeSuppliers: 0,
        blockedSuppliers: 0,
        totalOnChainBatches: 0,
      },
    });

    return {
      company: {
        id: company.id,
        name: company.name,
        cnpj: company.cnpj,
        email: company.email,
        plan: company.plan,
      },
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        role: manager.role,
      },
      message: 'Empresa e gerente criados com sucesso!',
      loginInfo: {
        email: manager.email,
        password: data.managerPassword,
      },
    };
  }

  async getSystemStats() {
    const [totalCompanies, totalUsers, totalBatches, totalDocuments] =
      await Promise.all([
        this.prisma.company.count(),
        this.prisma.user.count(),
        this.prisma.batch.count(),
        this.prisma.document.count(),
      ]);

    return {
      totalCompanies,
      totalUsers,
      totalBatches,
      totalDocuments,
    };
  }
}
