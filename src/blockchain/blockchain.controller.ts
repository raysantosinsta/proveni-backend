/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/blockchain/blockchain.controller.ts
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/guards/decorators/current-user.decorator';
import { BatchQueryResult, BlockchainService } from './blockchain.service';
import { PrismaService } from '../prisma/prisma.service';

// Interface para os resultados em lote
interface BulkResult {
  batchId: string;
  found: boolean;
  data: BatchQueryResult | null;
}

interface RegisterResult {
  batchId: string;
  success: boolean;
  txHash?: string;
  error?: string;
}

@Controller('blockchain')
export class BlockchainController {
  logger: any;
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly prisma: PrismaService, // ← ADICIONE ESTA LINHA
  ) {}

  // ============================================================
  // 🔓 ROTAS PÚBLICAS (Para Alfândega e Consultas)
  // ============================================================

  /**
   * Consulta um lote específico pelo ID
   * GET /blockchain/batch/:batchId
   */
  @Get('batch/:batchId')
  async getBatch(@Param('batchId') batchId: string) {
    const batch = await this.blockchainService.getBatch(batchId);

    if (!batch) {
      throw new HttpException(
        {
          success: false,
          message: 'Lote não encontrado na blockchain',
          batchId,
          tip: 'Verifique se o código do lote está correto',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      success: true,
      data: batch,
      verifiedAt: new Date().toISOString(),
      blockchain: true,
    };
  }

  /**
   * Verifica se um lote existe na blockchain
   * GET /blockchain/batch/:batchId/exists
   */
  @Get('batch/:batchId/exists')
  async checkBatchExists(@Param('batchId') batchId: string) {
    const exists = await this.blockchainService.isBatchRegistered(batchId);

    return {
      success: true,
      batchId,
      exists,
      message: exists ? 'Lote registrado na blockchain' : 'Lote não encontrado',
    };
  }

  /**
   * Lista todos os lotes registrados
   * GET /blockchain/batches
   */
  @Get('batches')
  async getAllBatches() {
    const batches = await this.blockchainService.getAllBatches();

    return {
      success: true,
      count: batches.length,
      data: batches,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Lista lotes com paginação
   * GET /blockchain/batches/paginated?page=1&limit=10
   */
  @Get('batches/paginated')
  async getBatchesPaginated(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(limit, 50);
    const result = await this.blockchainService.getBatchesPaginated(
      page,
      safeLimit,
    );

    return {
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Lista lotes recentes
   * GET /blockchain/batches/recent?limit=5
   */
  @Get('batches/recent')
  async getRecentBatches(
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(limit, 20);
    const batches = await this.blockchainService.getRecentBatches(safeLimit);

    return {
      success: true,
      count: batches.length,
      data: batches,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Estatísticas da blockchain
   * GET /blockchain/stats
   */
  @Get('stats')
  async getStats() {
    const total = await this.blockchainService.getBatchCount();
    const health = await this.blockchainService.healthCheck();
    const recentBatches = await this.blockchainService.getRecentBatches(5);

    const totalCO2 = recentBatches.reduce(
      (sum, batch) => sum + batch.co2Emitted,
      0,
    );

    return {
      success: true,
      data: {
        totalBatches: total,
        totalCO2Kg: totalCO2,
        lastUpdate: new Date().toISOString(),
        network: {
          connected: health.connected,
          blockNumber: health.blockNumber,
          contractAddress: health.contractAddress,
        },
        recentActivity: recentBatches.map((b) => ({
          batchId: b.batchId,
          productName: b.productName,
          registeredAt: b.registeredAt,
        })),
      },
    };
  }

  /**
   * Verifica saúde da conexão com blockchain
   * GET /blockchain/health
   */
  @Get('health')
  async healthCheck() {
    const health = await this.blockchainService.healthCheck();

    return {
      success: health.connected,
      status: health.connected ? 'online' : 'offline',
      ...health,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Busca múltiplos lotes por IDs
   * POST /blockchain/batches/bulk
   * Body: { batchIds: ["LOTE-001", "LOTE-002"] }
   */
  @Post('batches/bulk')
  async getBatchesBulk(@Body() body: { batchIds: string[] }) {
    if (!body.batchIds || !Array.isArray(body.batchIds)) {
      throw new HttpException(
        { success: false, message: 'batchIds deve ser um array' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const results: BulkResult[] = [];

    for (const batchId of body.batchIds) {
      const batch = await this.blockchainService.getBatch(batchId);
      results.push({
        batchId,
        found: !!batch,
        data: batch || null,
      });
    }

    return {
      success: true,
      results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Busca lotes por empresa
   * GET /blockchain/batches/company/:companyName
   */
  @Get('batches/company/:companyName')
  async getBatchesByCompany(@Param('companyName') companyName: string) {
    const allBatches = await this.blockchainService.getAllBatches();
    const filteredBatches = allBatches.filter((batch) =>
      batch.companyName.toLowerCase().includes(companyName.toLowerCase()),
    );

    return {
      success: true,
      companyName,
      count: filteredBatches.length,
      data: filteredBatches,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Busca lotes por período
   * GET /blockchain/batches/period?start=2024-01-01&end=2024-12-31
   */
  @Get('batches/period')
  async getBatchesByPeriod(
    @Query('start') startDate: string,
    @Query('end') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new HttpException(
        { success: false, message: 'Parâmetros start e end são obrigatórios' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new HttpException(
        { success: false, message: 'Datas inválidas' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const allBatches = await this.blockchainService.getAllBatches();
    const filteredBatches = allBatches.filter((batch) => {
      const registeredAt = new Date(batch.registeredAt);
      return registeredAt >= start && registeredAt <= end;
    });

    return {
      success: true,
      period: { start: startDate, end: endDate },
      count: filteredBatches.length,
      data: filteredBatches,
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================
  // 🔒 ROTAS DE ESCRITA (Apenas Admin/Especialista)
  // ============================================================

  /**
   * Registra um lote na blockchain
   * POST /blockchain/register/:batchId
   * 🔒 Requer autenticação e role de SPECIALIST
   */
  @Post('register/:batchId')
  @UseGuards(JwtAuthGuard)
  async registerBatch(
    @Param('batchId') batchId: string,
    @CurrentUser() user: any,
  ) {
    try {
      this.logger.log(
        `Usuário ${user.id} solicitou registro do lote ${batchId}`,
      );

      const result = await this.blockchainService.registerBatch(batchId);

      return {
        success: true,
        message: 'Lote registrado na blockchain com sucesso',
        batchId,
        txHash: result.txHash,
        registeredBy: user.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error(`Erro ao registrar lote ${batchId}: ${error.message}`);

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Erro ao registrar lote',
          batchId,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Registra múltiplos lotes na blockchain
   * POST /blockchain/register/bulk
   * Body: { batchIds: ["LOTE-001", "LOTE-002"] }
   * 🔒 Requer autenticação e role de SPECIALIST
   */
  @Post('register/bulk')
  @UseGuards(JwtAuthGuard)
  async registerBatches(
    @Body() body: { batchIds: string[] },
    @CurrentUser() user: any,
  ) {
    if (!body.batchIds || !Array.isArray(body.batchIds)) {
      throw new HttpException(
        { success: false, message: 'batchIds deve ser um array' },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(
      `Usuário ${user.id} solicitou registro de ${body.batchIds.length} lotes`,
    );

    const results: RegisterResult[] = [];

    for (const batchId of body.batchIds) {
      try {
        const result = await this.blockchainService.registerBatch(batchId);
        results.push({
          batchId,
          success: true,
          txHash: result.txHash,
        });
      } catch (error: any) {
        results.push({
          batchId,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return {
      success: true,
      summary: {
        total: results.length,
        success: successCount,
        failed: failCount,
      },
      results,
      registeredBy: user.id,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /blockchain/batch/:batchId/traceability
   * Retorna rastreabilidade COMPLETA (inclui fornecedores)
   * 🔓 ROTA PÚBLICA - Para Alfândega
   */
  @Get('batch/:batchId/traceability')
  async getFullTraceability(@Param('batchId') batchId: string) {
    // 1. Buscar dados da blockchain
    const blockchainData = await this.blockchainService.getBatch(batchId);

    if (!blockchainData) {
      throw new HttpException(
        {
          success: false,
          message: 'Lote não encontrado na blockchain',
          batchId,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Buscar dados do banco (incluindo fornecedores)
    const batchWithSuppliers = await this.prisma.batch.findUnique({
      where: { batchId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            cnpj: true,
          },
        },
        batchSuppliers: {
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                cnpj: true,
                email: true,
              },
            },
            document: {
              select: {
                id: true,
                ipfsHash: true,
                originalName: true,
              },
            },
          },
        },
      },
    });

    if (!batchWithSuppliers) {
      throw new HttpException(
        {
          success: false,
          message: 'Lote não encontrado no banco de dados',
          batchId,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 3. Montar resposta com rastreabilidade completa
    const totalCO2 = blockchainData.co2Emitted;

    const suppliersTraceability = batchWithSuppliers.batchSuppliers.map(
      (bs) => {
        const co2Contribution = bs.co2Emitted || 0;
        const percentageOfTotal =
          totalCO2 > 0 ? ((co2Contribution / totalCO2) * 100).toFixed(1) : '0';

        // 🔧 CORREÇÃO: Definir documentInfo com tipo correto
        type DocumentInfo = {
          name: string;
          ipfsHash: string;
          url: string;
        } | null;

        let documentInfo: DocumentInfo = null;

        if (bs.document && bs.document.ipfsHash) {
          documentInfo = {
            name: bs.document.originalName || 'Documento',
            ipfsHash: bs.document.ipfsHash,
            url: this.getIpfsUrl(bs.document.ipfsHash),
          };
        }

        return {
          name: bs.supplier.name,
          cnpj: bs.supplier.cnpj,
          material: bs.productName || 'Material não especificado',
          co2Emitted: co2Contribution,
          percentageOfTotal: `${percentageOfTotal}%`,
          document: documentInfo,
        };
      },
    );

    return {
      success: true,
      batchId: batchId,
      verifiedAt: new Date().toISOString(),
      blockchain: {
        txHash: batchWithSuppliers.blockchainTxHash,
        registeredAt: blockchainData.registeredAt,
        registeredBy: blockchainData.registeredBy,
      },
      product: {
        name: blockchainData.productName,
        totalCO2: blockchainData.co2Emitted,
        isCompliant: blockchainData.isCompliant,
      },
      exporter: {
        name: batchWithSuppliers.company?.name || 'Desconhecido',
        cnpj: batchWithSuppliers.company?.cnpj || '—',
      },
      suppliers: suppliersTraceability,
      documents: {
        productDocument: blockchainData.ipfsDocumentHash || '',
        productDocumentUrl: blockchainData.ipfsDocumentHash
          ? this.getIpfsUrl(blockchainData.ipfsDocumentHash)
          : '',
      },
    };
  }

  // Método auxiliar para URL do IPFS (com segurança para null)
  private getIpfsUrl(hash: string | null): string {
    if (!hash) return '';
    return `https://gateway.pinata.cloud/ipfs/${hash}`;
  }
}
