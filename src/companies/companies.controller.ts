/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/companies/companies.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from 'src/common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from 'src/common/guards/decorators/current-user.decorator';
import { CreateCompanyWithManagerDto } from 'src/companies/dto/create-company-with-manager.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('dashboard')
  @Roles(Role.MANAGER, Role.ADMIN)
  getDashboard(@CurrentUser() user: any) {
    const companyId =
      user.role === Role.ADMIN ? user.companyId : user.companyId;
    return this.companiesService.getDashboardStats(companyId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.role !== Role.ADMIN && user.companyId !== id) {
      throw new Error('Acesso negado');
    }
    return this.companiesService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateCompanyDto>,
  ) {
    return this.companiesService.update(id, updateDto);
  }

  @Post('with-manager')
  @Roles(Role.ADMIN)
  async createCompanyWithManager(@Body() dto: CreateCompanyWithManagerDto) {
    return this.companiesService.createCompanyWithManager(dto);
  }

  @Get('stats/system')
  @Roles(Role.ADMIN)
  async getSystemStats() {
    return this.companiesService.getSystemStats();
  }
}
