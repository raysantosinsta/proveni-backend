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
  @Roles(Role.ADMIN, Role.SPECIALIST) // ✅ Adicionado SPECIALIST
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('dashboard')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST)
  getDashboard(@CurrentUser() user: any) {
    return this.companiesService.getDashboardStats(user.companyId, user.role);
  }

  @Get(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST) // ✅ Adicionado SPECIALIST
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.role !== Role.ADMIN && user.companyId !== id) {
      throw new Error('Acesso negado');
    }
    return this.companiesService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST) // ✅ Adicionado SPECIALIST
  update(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateCompanyDto>,
  ) {
    return this.companiesService.update(id, updateDto);
  }

  @Post('with-manager')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST) // ✅ Adicionado SPECIALIST
  async createCompanyWithManager(@Body() dto: CreateCompanyWithManagerDto) {
    return this.companiesService.createCompanyWithManager(dto);
  }

  @Get('stats/system')
  @Roles(Role.MANAGER, Role.ADMIN, Role.SPECIALIST) // ✅ Adicionado SPECIALIST
  async getSystemStats() {
    return this.companiesService.getSystemStats();
  }
}
