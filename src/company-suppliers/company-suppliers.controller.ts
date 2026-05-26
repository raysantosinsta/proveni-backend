/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CompanySuppliersService } from './company-suppliers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from 'src/common/guards/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from 'src/common/guards/decorators/current-user.decorator';
import { CreateSupplierDirectlyDto } from 'src/company-suppliers/dto/create-company-supplier.dto';

@Controller('company-suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanySuppliersController {
  constructor(private companySuppliersService: CompanySuppliersService) {}

  @Post('direct')
  @Roles(Role.MANAGER, Role.ADMIN)
  createDirect(
    @CurrentUser() user: any,
    @Body() dto: CreateSupplierDirectlyDto,
  ) {
    const companyId = user.role === Role.ADMIN ? dto.companyId : user.companyId;
    return this.companySuppliersService.createSupplierDirectly(companyId, dto);
  }

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN)
  getSuppliers(@CurrentUser() user: any) {
    const companyId = user.companyId;
    return this.companySuppliersService.getSuppliersByCompany(companyId);
  }

  @Delete(':supplierId')
  @Roles(Role.MANAGER, Role.ADMIN)
  blockSupplier(
    @CurrentUser() user: any,
    @Param('supplierId') supplierId: string,
  ) {
    return this.companySuppliersService.blockSupplier(
      user.companyId,
      supplierId,
    );
  }
}
