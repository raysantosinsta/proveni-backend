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
    const rpcUrl = this.configService.get<string>('BLOCKCHAIN_RPC_URL');
    const privateKey = this.configService.get<string>('BLOCKCHAIN_PRIVATE_KEY');
    const contractAddress = this.configService.get<string>('CONTRACT_ADDRESS');

    if (
      rpcUrl &&
      privateKey &&
      contractAddress &&
      ethers.isAddress(contractAddress)
    ) {
      try {
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.signer = new ethers.Wallet(privateKey, this.provider);

        // ABI legível por humanos (Human-Readable ABI) do contrato
        const abi = [
          'function registerBatch(string batchId, string productName, uint256 co2Emitted, string companyName, bool isCompliant, string ipfsDocumentHash) public returns (string)',
        ];

        this.contract = new ethers.Contract(contractAddress, abi, this.signer);
        this.logger.log(
          'Conexão com a Blockchain e contrato configurada com sucesso.',
        );
      } catch (error) {
        this.logger.error(
          'Erro ao inicializar conexão com a Blockchain:',
          error,
        );
      }
    } else {
      this.logger.warn(
        'Configurações da blockchain ausentes ou inválidas no arquivo .env (BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, CONTRACT_ADDRESS). O serviço blockchain funcionará de forma limitada.',
      );
    }
  }

  async registerBatch(batchId: string) {
    if (!this.contract) {
      throw new BadRequestException(
        'Contrato da Blockchain não inicializado. Verifique as configurações no arquivo .env.',
      );
    }

    const batch = await this.prisma.batch.findUnique({
      where: { batchId },
      include: { company: true, batchSuppliers: true },
    });

    if (!batch) {
      throw new NotFoundException(`Lote com ID ${batchId} não encontrado.`);
    }

    // Tratamento de valores opcionais para a blockchain
    const co2 = batch.co2Emitted ? Math.round(batch.co2Emitted) : 0; // uint256 não aceita ponto flutuante
    const companyName = batch.company?.name || 'Empresa Desconhecida';
    const ipfsHash = batch.ipfsDocumentHash || '';

    try {
      this.logger.log(`Registrando lote ${batchId} na Blockchain...`);

      const tx = await this.contract.registerBatch(
        batch.batchId,
        batch.productName,
        co2,
        companyName,
        batch.isCompliant,
        ipfsHash,
      );

      this.logger.log(`Transação enviada: ${tx.hash}. Aguardando mineração...`);
      const receipt = await tx.wait();

      await this.prisma.batch.update({
        where: { batchId },
        data: {
          blockchainTxHash: receipt.hash,
          blockchainRegisteredAt: new Date(),
          status: 'COMPLETED',
        },
      });

      this.logger.log(
        `Lote ${batchId} registrado com sucesso na transação ${receipt.hash}`,
      );
      return { txHash: receipt.hash };
    } catch (error: any) {
      this.logger.error(
        `Erro ao registrar lote na Blockchain: ${error.message || error}`,
      );
      throw new BadRequestException(
        `Falha ao registrar na Blockchain: ${error.message || error}`,
      );
    }
  }
}
