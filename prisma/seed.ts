/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Iniciando seed do PROVENI...');

  // 1. Criar ADMIN
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@proveni.com' },
    update: {},
    create: {
      email: 'admin@proveni.com',
      passwordHash: adminPassword,
      name: 'Administrador PROVENI',
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`✅ Admin criado: admin@proveni.com / admin123`);

  // 2. Criar EMPRESA CLIENTE
  const company = await prisma.company.upsert({
    where: { cnpj: '12.345.678/0001-90' },
    update: {},
    create: {
      name: 'Fábrica de Bonequinhos S/A',
      cnpj: '12.345.678/0001-90',
      email: 'contato@bonequinhos.com.br',
      phone: '(11) 99999-9999',
      companyType: 'CLIENT',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Empresa criada: ${company.name}`);

  // 3. Criar MANAGER (cliente)
  const managerPassword = await bcrypt.hash('marina123', 10);
  await prisma.user.upsert({
    where: { email: 'marina@bonequinhos.com.br' },
    update: {},
    create: {
      email: 'marina@bonequinhos.com.br',
      passwordHash: managerPassword,
      name: 'Marina Silva',
      role: 'MANAGER',
      companyId: company.id,
      isActive: true,
    },
  });
  console.log(`✅ Manager criado: marina@bonequinhos.com.br / marina123`);

  // 4. Criar FORNECEDOR
  const supplier = await prisma.company.upsert({
    where: { cnpj: '98.765.432/0001-10' },
    update: {},
    create: {
      name: 'EcoPlast S/A',
      cnpj: '98.765.432/0001-10',
      email: 'contato@ecoplast.com.br',
      phone: '(11) 98888-7777',
      companyType: 'SUPPLIER',
      plan: 'BASIC',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Fornecedor criado: ${supplier.name}`);

  // 5. Criar relação Cliente-Fornecedor
  await prisma.companySupplier.upsert({
    where: {
      companyId_supplierId: {
        companyId: company.id,
        supplierId: supplier.id,
      },
    },
    update: {},
    create: {
      companyId: company.id,
      supplierId: supplier.id,
      status: 'ACTIVE',
      invitedAt: new Date(),
      acceptedAt: new Date(),
    },
  });
  console.log(`✅ Relação Cliente-Fornecedor criada`);

  // 6. Criar OPERADOR PROVENI
  const operatorPassword = await bcrypt.hash('operator123', 10);
  await prisma.user.upsert({
    where: { email: 'operator@proveni.com' },
    update: {},
    create: {
      email: 'operator@proveni.com',
      passwordHash: operatorPassword,
      name: 'Operador PROVENI',
      role: 'OPERATOR',
      isActive: true,
    },
  });
  console.log(`✅ Operador criado: operator@proveni.com / operator123`);

  // 7. Criar ESPECIALISTA PROVENI
  const specialistPassword = await bcrypt.hash('specialist123', 10);
  await prisma.user.upsert({
    where: { email: 'specialist@proveni.com' },
    update: {},
    create: {
      email: 'specialist@proveni.com',
      passwordHash: specialistPassword,
      name: 'Especialista ESG',
      role: 'SPECIALIST',
      isActive: true,
    },
  });
  console.log(`✅ Especialista criado: specialist@proveni.com / specialist123`);

  // 8. Criar usuário FORNECEDOR
  const supplierUserPassword = await bcrypt.hash('ecoplast123', 10);
  await prisma.user.upsert({
    where: { email: 'roberto@ecoplast.com.br' },
    update: {},
    create: {
      email: 'roberto@ecoplast.com.br',
      passwordHash: supplierUserPassword,
      name: 'Roberto Alves',
      role: 'SUPPLIER',
      companyId: supplier.id,
      isActive: true,
    },
  });
  console.log(
    `✅ Usuário fornecedor criado: roberto@ecoplast.com.br / ecoplast123`,
  );

  // 9. Criar métricas iniciais
  await prisma.metric.upsert({
    where: {
      companyId_periodType_periodDate: {
        companyId: company.id,
        periodType: 'MONTH',
        periodDate: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ),
      },
    },
    update: {},
    create: {
      companyId: company.id,
      periodType: 'MONTH',
      periodDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      totalBatches: 0,
      totalCo2Emitted: 0,
    },
  });
  console.log(`✅ Métricas iniciais criadas`);

  // 10. Criar LOTE DE TESTE
  const batch = await prisma.batch.upsert({
    where: { batchId: 'LOTE-TEST-001' },
    update: {},
    create: {
      batchId: 'LOTE-TEST-001',
      productName: 'Camisa Social Azul',
      productDescription: 'Lote de camisas para testes de integração',
      quantity: 120,
      unit: 'unidades',
      companyId: company.id,
      status: 'DRAFT',
      productionDate: new Date('2026-05-23'),
    },
  });
  console.log(`✅ Lote de teste criado: ${batch.batchId} (id: ${batch.id})`);

  console.log('\n🎉 SEED CONCLUÍDO!');
  console.log('========================================');
  console.log('👤 ADMIN:      admin@proveni.com / admin123');
  console.log('👤 MANAGER:    marina@bonequinhos.com.br / marina123');
  console.log('👤 OPERATOR:   operator@proveni.com / operator123');
  console.log('👤 SPECIALIST: specialist@proveni.com / specialist123');
  console.log('👤 SUPPLIER:   roberto@ecoplast.com.br / ecoplast123');
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
