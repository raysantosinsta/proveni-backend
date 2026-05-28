/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { BlockchainService } from '../blockchain/blockchain.service';
import { Role } from '@prisma/client';

@Injectable()
export class BatchesService {
  constructor(
    private prisma: PrismaService,
    private blockchainService: BlockchainService,
  ) {}

  async create(companyId: string, dto: CreateBatchDto) {
    if (!companyId) {
      throw new Error('companyId é obrigatório para criar um lote');
    }
    return this.prisma.batch.create({
      data: {
        batchId: dto.batchId,
        productName: dto.productName,
        productDescription: dto.productDescription,
        quantity: dto.quantity,
        unit: dto.unit,
        companyId,
        status: 'DRAFT',
      },
    });
  }

  async findAllByCompany(companyId?: string, userRole?: string) {
    // Para SPECIALIST (sem companyId), busca todos os lotes
    if (!companyId || userRole === Role.SPECIALIST) {
      return this.prisma.batch.findMany({
        include: {
          documents: true,
          batchSuppliers: { include: { supplier: true } },
          company: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Para MANAGER e ADMIN com companyId
    return this.prisma.batch.findMany({
      where: { companyId },
      include: {
        documents: true,
        batchSuppliers: { include: { supplier: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(batchId: string, companyId?: string, userRole?: string) {
    let batch;

    if (!companyId || userRole === Role.SPECIALIST) {
      batch = await this.prisma.batch.findUnique({
        where: { batchId },
        include: {
          documents: true,
          batchSuppliers: { include: { supplier: true } },
          company: true,
        },
      });
    } else {
      batch = await this.prisma.batch.findFirst({
        where: { batchId, companyId },
        include: {
          documents: true,
          batchSuppliers: { include: { supplier: true } },
        },
      });
    }

    if (!batch) throw new NotFoundException('Lote não encontrado');
    return batch;
  }

  async updateStatus(batchId: string, status: any) {
    return this.prisma.batch.update({ where: { batchId }, data: { status } });
  }

  async calculateTotalCO2(batchId: string) {
    const batchSuppliers = await this.prisma.batchSupplier.findMany({
      where: { batchId },
    });

    const totalCO2 = batchSuppliers.reduce(
      (sum, bs) => sum + (bs.co2Emitted || 0),
      0,
    );

    await this.prisma.batch.update({
      where: { batchId },
      data: { co2Emitted: totalCO2 },
    });

    return totalCO2;
  }

  async getComplianceStatus(batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: { complianceRule: true },
    });

    if (!batch) throw new NotFoundException('Lote não encontrado');

    if (!batch.complianceRule)
      return { isCompliant: true, reason: 'Sem regra aplicável' };

    const isCompliant =
      (batch.co2Emitted ?? 0) <= batch.complianceRule.co2Limit;
    return {
      isCompliant,
      reason: isCompliant
        ? 'Dentro do limite'
        : `CO₂ excede limite de ${batch.complianceRule.co2Limit} ${batch.complianceRule.co2Unit}`,
    };
  }

  async registerOnBlockchain(batchId: string) {
    // 1. Atualizar o status para BLOCKCHAIN
    await this.prisma.batch.update({
      where: { batchId },
      data: { status: 'BLOCKCHAIN' },
    });

    try {
      // 2. Chamar o serviço de blockchain
      const result = await this.blockchainService.registerBatch(batchId);
      return result;
    } catch (error) {
      // 3. Em caso de falha, marca como ERROR
      await this.prisma.batch.update({
        where: { batchId },
        data: { status: 'ERROR' },
      });
      throw error;
    }
  }
}
