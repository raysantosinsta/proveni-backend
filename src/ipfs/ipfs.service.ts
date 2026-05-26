/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private readonly pinataApiKey: string;
  private readonly pinataSecretKey: string;

  constructor(private configService: ConfigService) {
    this.pinataApiKey = this.configService.get<string>('PINATA_API_KEY') || '';
    this.pinataSecretKey =
      this.configService.get<string>('PINATA_SECRET_KEY') || '';
  }

  async uploadFile(filePath: string): Promise<string> {
    const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const response = await axios.post(url, formData, {
      headers: {
        pinata_api_key: this.pinataApiKey,
        pinata_secret_api_key: this.pinataSecretKey,
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
    });

    this.logger.log(
      `Arquivo enviado para IPFS. Hash: ${response.data.IpfsHash}`,
    );
    return response.data.IpfsHash;
  }

  getPublicUrl(ipfsHash: string): string {
    return `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
  }
}
