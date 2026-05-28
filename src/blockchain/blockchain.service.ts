/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// src/blockchain/blockchain.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { PrismaService } from '../prisma/prisma.service';

// Interface para os dados retornados da blockchain
export interface BlockchainBatchData {
  batchId: string;
  productName: string;
  co2Emitted: number;
  companyName: string;
  isCompliant: boolean;
  ipfsDocumentHash: string;
  registeredAt: Date;
  registeredBy: string;
  index: number;
}

export interface BatchQueryResult {
  productName: string;
  co2Emitted: number;
  companyName: string;
  isCompliant: boolean;
  ipfsDocumentHash: string;
  registeredAt: Date;
  registeredBy: string;
}

@Injectable()
export class BlockchainService {
  private provider?: ethers.Provider;
  private signer?: ethers.Wallet;
  private contract?: ethers.Contract;
  private readonly logger = new Logger(BlockchainService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.initializeBlockchainConnection();
  }

  private initializeBlockchainConnection() {
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    const privateKey = this.configService.get<string>('BLOCKCHAIN_PRIVATE_KEY');
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');

    // ✅ VALIDAÇÃO: Verificar se as configurações existem
    if (!rpcUrl) {
      this.logger.error('❌ BLOCKCHAIN_RPC_URL não configurada no .env');
      return;
    }

    if (!contractAddress) {
      this.logger.error('❌ CONTRACT_ADDRESS não configurada no .env');
      return;
    }

    // ✅ Logs para debug
    this.logger.log(`📋 RPC URL: ${rpcUrl}`);
    this.logger.log(`📋 Contract Address: ${contractAddress}`);
    this.logger.log(`📋 Private Key exists: ${!!privateKey}`);

    try {
      this.logger.log(`🔗 Conectando a: ${rpcUrl}`);
      this.logger.log(`📋 Contrato: ${contractAddress}`);

      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      // ABI completa do contrato (versão Human-Readable)
      const abi = [
        // Funções de LEITURA (públicas - não precisam de assinatura)
        'function getBatch(string calldata batchId) external view returns (string productName, uint256 co2Emitted, string companyName, bool isCompliant, string ipfsDocumentHash, uint256 registeredAt, address registeredBy)',
        'function isBatchRegistered(string calldata batchId) external view returns (bool)',
        'function getBatchCount() external view returns (uint256)',
        'function getBatchIdByIndex(uint256 index) external view returns (string)',

        // Função de ESCRITA (apenas owner - precisa de chave privada)
        'function registerBatch(string calldata batchId, string calldata productName, uint256 co2Emitted, string calldata companyName, bool isCompliant, string calldata ipfsDocumentHash) external returns (string)',
      ];

      // Se temos chave privada, criamos um signer para escrita
      if (privateKey && privateKey !== '0x' && privateKey !== '') {
        this.signer = new ethers.Wallet(privateKey, this.provider);
        this.contract = new ethers.Contract(contractAddress, abi, this.signer);
        this.logger.log(
          '🔗 Blockchain conectada com permissão de ESCRITA (owner)',
        );

        // Log da conta e saldo
        this.signer
          .getAddress()
          .then(async (address) => {
            const balance = await this.provider!.getBalance(address);
            this.logger.log(`👛 Conta: ${address}`);
            this.logger.log(`💰 Saldo: ${ethers.formatEther(balance)} ETH`);
          })
          .catch((err) => {
            this.logger.warn(`Não foi possível obter saldo: ${err.message}`);
          });
      } else {
        // Apenas leitura (para consultas públicas como a alfândega)
        this.contract = new ethers.Contract(
          contractAddress,
          abi,
          this.provider,
        );
        this.logger.log('🔗 Blockchain conectada em modo LEITURA (público)');
        this.logger.warn(
          '⚠️ Sem chave privada - não é possível registrar lotes',
        );
      }

      this.logger.log(`✅ Blockchain inicializada com sucesso`);
    } catch (error: any) {
      this.logger.error(
        '❌ Erro ao inicializar conexão com a Blockchain:',
        error,
      );
      this.logger.warn(
        '⚠️ Serviço blockchain funcionará em modo limitado (simulado)',
      );
    }
  }

  // ============================================================
  // 🔓 FUNÇÕES DE LEITURA (PÚBLICAS - Para Alfândega e Consultas)
  // ============================================================

  /**
   * Consulta um lote pelo ID na blockchain
   * @param batchId - Código do lote (ex: LOTE-2025-001)
   * @returns Dados completos do lote ou null se não encontrado
   */
  async getBatch(batchId: string): Promise<BatchQueryResult | null> {
    if (!this.contract) {
      throw new BadRequestException(
        'Blockchain não disponível. Verifique a conexão com a rede.',
      );
    }

    try {
      this.logger.log(`🔍 Consultando lote ${batchId} na blockchain...`);

      const result = await this.contract.getBatch(batchId);

      return {
        productName: result[0],
        co2Emitted: Number(result[1]),
        companyName: result[2],
        isCompliant: result[3],
        ipfsDocumentHash: result[4],
        registeredAt: new Date(Number(result[5]) * 1000),
        registeredBy: result[6],
      };
    } catch (error: any) {
      if (
        error.message?.includes('Lote nao encontrado') ||
        error.message?.includes('execution reverted')
      ) {
        this.logger.warn(`⚠️ Lote ${batchId} não encontrado na blockchain`);
        return null;
      }

      this.logger.error(`Erro ao buscar lote ${batchId}: ${error.message}`);
      throw new BadRequestException(
        `Erro ao consultar blockchain: ${error.message}`,
      );
    }
  }

  /**
   * Verifica se um lote existe na blockchain
   * @param batchId - Código do lote
   * @returns boolean
   */
  async isBatchRegistered(batchId: string): Promise<boolean> {
    if (!this.contract) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      return await this.contract.isBatchRegistered(batchId);
    } catch (error: any) {
      this.logger.error(`Erro ao verificar lote ${batchId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Retorna todos os lotes registrados na blockchain
   * @returns Lista completa de lotes
   */
  async getAllBatches(): Promise<BlockchainBatchData[]> {
    if (!this.contract) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      const count = await this.contract.getBatchCount();
      this.logger.log(
        `📦 Buscando ${count} lotes registrados na blockchain...`,
      );

      const batches: BlockchainBatchData[] = [];

      for (let i = 0; i < Number(count); i++) {
        const batchId = await this.contract.getBatchIdByIndex(i);
        const batchData = await this.getBatch(batchId);

        if (batchData) {
          batches.push({
            batchId,
            productName: batchData.productName,
            co2Emitted: batchData.co2Emitted,
            companyName: batchData.companyName,
            isCompliant: batchData.isCompliant,
            ipfsDocumentHash: batchData.ipfsDocumentHash,
            registeredAt: batchData.registeredAt,
            registeredBy: batchData.registeredBy,
            index: i,
          });
        }
      }

      this.logger.log(`✅ Encontrados ${batches.length} lotes na blockchain`);
      return batches;
    } catch (error: any) {
      this.logger.error(`Erro ao listar lotes: ${error.message}`);
      return [];
    }
  }

  /**
   * Obtém o total de lotes registrados
   * @returns Número de lotes
   */
  async getBatchCount(): Promise<number> {
    if (!this.contract) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      const count = await this.contract.getBatchCount();
      return Number(count);
    } catch (error: any) {
      this.logger.error(`Erro ao obter contagem: ${error.message}`);
      return 0;
    }
  }

  /**
   * Busca lote pelo índice (para paginação)
   * @param index - Índice do lote
   * @returns ID do lote
   */
  async getBatchIdByIndex(index: number): Promise<string | null> {
    if (!this.contract) {
      throw new BadRequestException('Blockchain não disponível');
    }

    try {
      const count = await this.contract.getBatchCount();
      if (index >= Number(count)) {
        return null;
      }
      return await this.contract.getBatchIdByIndex(index);
    } catch (error: any) {
      this.logger.error(`Erro ao buscar índice ${index}: ${error.message}`);
      return null;
    }
  }

  /**
   * Busca lotes com paginação
   * @param page - Página (começa em 1)
   * @param limit - Itens por página
   * @returns Lista paginada
   */
  async getBatchesPaginated(
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    data: BlockchainBatchData[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const total = await this.getBatchCount();
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, total);

    const batches: BlockchainBatchData[] = [];

    for (let i = startIndex; i < endIndex; i++) {
      const batchId = await this.getBatchIdByIndex(i);
      if (batchId) {
        const batchData = await this.getBatch(batchId);
        if (batchData) {
          batches.push({
            batchId,
            productName: batchData.productName,
            co2Emitted: batchData.co2Emitted,
            companyName: batchData.companyName,
            isCompliant: batchData.isCompliant,
            ipfsDocumentHash: batchData.ipfsDocumentHash,
            registeredAt: batchData.registeredAt,
            registeredBy: batchData.registeredBy,
            index: i,
          });
        }
      }
    }

    return {
      data: batches,
      total,
      page,
      totalPages,
    };
  }

  /**
   * Busca lotes recentes (últimos N)
   * @param limit - Quantidade de lotes
   * @returns Lista dos lotes mais recentes
   */
  async getRecentBatches(limit: number = 5): Promise<BlockchainBatchData[]> {
    const total = await this.getBatchCount();
    const startIndex = Math.max(0, total - limit);

    const batches: BlockchainBatchData[] = [];

    for (let i = total - 1; i >= startIndex; i--) {
      const batchId = await this.getBatchIdByIndex(i);
      if (batchId) {
        const batchData = await this.getBatch(batchId);
        if (batchData) {
          batches.push({
            batchId,
            productName: batchData.productName,
            co2Emitted: batchData.co2Emitted,
            companyName: batchData.companyName,
            isCompliant: batchData.isCompliant,
            ipfsDocumentHash: batchData.ipfsDocumentHash,
            registeredAt: batchData.registeredAt,
            registeredBy: batchData.registeredBy,
            index: i,
          });
        }
      }
    }

    return batches;
  }

  // ============================================================
  // 🔒 FUNÇÕES DE ESCRITA (Apenas Owner)
  // ============================================================

  /**
   * Registra um lote na blockchain
   * @param batchId - Código do lote
   * @returns Hash da transação
   */
  async registerBatch(batchId: string): Promise<{ txHash: string }> {
    if (!this.contract || !this.signer) {
      throw new BadRequestException(
        'Contrato da Blockchain não inicializado para escrita. Verifique se a chave privada está configurada.',
      );
    }

    // Busca dados do lote no banco local
    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: { company: true },
    });

    if (!batch) {
      throw new NotFoundException(`Lote com ID ${batchId} não encontrado.`);
    }

    // Prepara os dados para a blockchain
    const co2 = batch.co2Emitted ? Math.round(batch.co2Emitted) : 0;
    const companyName = batch.company?.name || 'Empresa Desconhecida';
    const ipfsHash = batch.ipfsDocumentHash || '';
    const isCompliant = batch.isCompliant ?? true;

    try {
      this.logger.log(`⛓️ Registrando lote ${batchId} na Blockchain...`);

      const tx = await this.contract.registerBatch(
        batch.batchId,
        batch.productName,
        co2,
        companyName,
        isCompliant,
        ipfsHash,
      );

      this.logger.log(
        `📤 Transação enviada: ${tx.hash}. Aguardando confirmação...`,
      );
      const receipt = await tx.wait();

      // Atualiza o banco com o hash da transação
      await this.prisma.batch.update({
        where: { batchId },
        data: {
          blockchainTxHash: receipt.hash,
          blockchainRegisteredAt: new Date(),
          status: 'COMPLETED',
        },
      });

      this.logger.log(`✅ Lote ${batchId} registrado! Tx: ${receipt.hash}`);
      return { txHash: receipt.hash };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao registrar lote: ${error.message}`);
      throw new BadRequestException(
        `Falha ao registrar na Blockchain: ${error.message}`,
      );
    }
  }

  /**
   * Verifica a saúde da conexão com a blockchain
   * @returns Status da conexão
   */
  async healthCheck(): Promise<{
    connected: boolean;
    blockNumber?: number;
    contractAddress?: string;
    hasSigner: boolean;
  }> {
    try {
      if (!this.provider || !this.contract) {
        return {
          connected: false,
          hasSigner: false,
        };
      }

      const blockNumber = await this.provider.getBlockNumber();
      const contractAddress = await this.contract.getAddress();

      return {
        connected: true,
        blockNumber,
        contractAddress,
        hasSigner: !!this.signer,
      };
    } catch (error) {
      return {
        connected: false,
        hasSigner: false,
      };
    }
  }
}
