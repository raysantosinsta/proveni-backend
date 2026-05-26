/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from 'src/common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from 'src/common/guards/decorators/current-user.decorator';

@Controller('batches')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchesController {
  constructor(private batchesService: BatchesService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@CurrentUser() user: any, @Body() createDto: CreateBatchDto) {
    return this.batchesService.create(user.companyId, createDto);
  }

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN)
  findAll(@CurrentUser() user: any) {
    return this.batchesService.findAllByCompany(user.companyId);
  }

  @Get(':batchId')
  @Roles(Role.MANAGER, Role.ADMIN)
  findOne(@CurrentUser() user: any, @Param('batchId') batchId: string) {
    return this.batchesService.findOne(batchId, user.companyId);
  }

  @Post(':batchId/calculate-co2')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  calculateCO2(@Param('batchId') batchId: string) {
    return this.batchesService.calculateTotalCO2(batchId);
  }

  @Get(':batchId/compliance')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getCompliance(@Param('batchId') batchId: string) {
    return this.batchesService.getComplianceStatus(batchId);
  }

  @Post(':batchId/register-blockchain')
  @Roles(Role.SPECIALIST, Role.ADMIN)
  registerBlockchain(@Param('batchId') batchId: string) {
    return this.batchesService.registerOnBlockchain(batchId);
  }
}
