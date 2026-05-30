// prisma/seed-clean.ts
import {
  PrismaClient,
  Role,
  DocumentStatus,
  DocumentType,
  CompanyType,
  Plan,
  CompanyStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando seed limpo do CarbonChain ESG...');
  console.log('='.repeat(60));

  // ============================================================
  // 1. LIMPAR DADOS EXISTENTES
  // ============================================================
  console.log('\n🗑️ Removendo dados existentes...');

  await prisma.syncLog.deleteMany();
  await prisma.dashboardView.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.metric.deleteMany();
  await prisma.batchSupplier.deleteMany();
  await prisma.document.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.companySupplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log('  ✅ Todos os dados removidos');

  // ============================================================
  // 2. CRIAR EMPRESAS
  // ============================================================
  console.log('\n🏢 Criando empresas...');

  // Exportador (Cliente)
  const exportador = await prisma.company.create({
    data: {
      name: 'Bonecos Brasil Indústria Ltda',
      cnpj: '12.345.678/0001-90',
      email: 'contato@bonecosbrasil.com.br',
      phone: '(11) 99999-8888',
      companyType: CompanyType.CLIENT,
      plan: Plan.PROFESSIONAL,
      status: CompanyStatus.ACTIVE,
    },
  });

  // PROVENI (Operadora)
  const proveniCompany = await prisma.company.create({
    data: {
      name: 'PROVENI Tecnologia',
      cnpj: '00.000.000/0001-00',
      email: 'operacoes@proveni.com',
      phone: '(11) 99999-7777',
      companyType: CompanyType.CLIENT,
      plan: Plan.ENTERPRISE,
      status: CompanyStatus.ACTIVE,
    },
  });

  // Fornecedores
  const plasticSupplier = await prisma.company.create({
    data: {
      name: 'EcoPlast Indústria de Plásticos',
      cnpj: '98.765.432/0001-10',
      email: 'vendas@ecoplast.com.br',
      phone: '(11) 88888-7777',
      companyType: CompanyType.SUPPLIER,
      plan: Plan.BASIC,
      status: CompanyStatus.ACTIVE,
    },
  });

  const paintSupplier = await prisma.company.create({
    data: {
      name: 'ColorTint Tintas Especiais',
      cnpj: '11.222.333/0001-44',
      email: 'comercial@colortint.com.br',
      phone: '(11) 77777-6666',
      companyType: CompanyType.SUPPLIER,
      plan: Plan.BASIC,
      status: CompanyStatus.ACTIVE,
    },
  });

  const packagingSupplier = await prisma.company.create({
    data: {
      name: 'EcoPack Embalagens Sustentáveis',
      cnpj: '55.666.777/0001-88',
      email: 'vendas@ecopack.com.br',
      phone: '(11) 66666-5555',
      companyType: CompanyType.SUPPLIER,
      plan: Plan.BASIC,
      status: CompanyStatus.ACTIVE,
    },
  });

  console.log(`  ✅ Exportador: ${exportador.name}`);
  console.log(`  ✅ PROVENI: ${proveniCompany.name}`);
  console.log(
    `  ✅ Fornecedores: ${plasticSupplier.name}, ${paintSupplier.name}, ${packagingSupplier.name}`,
  );

  // ============================================================
  // 3. CRIAR USUÁRIOS
  // ============================================================
  console.log('\n👤 Criando usuários...');

  const hashedPassword = await bcrypt.hash('123456', 10);

  // Manager (Exportador)
  const manager = await prisma.user.create({
    data: {
      name: 'Carlos Silva',
      email: 'carlos@bonecosbrasil.com.br',
      passwordHash: hashedPassword,
      role: Role.MANAGER,
      companyId: exportador.id,
      isActive: true,
    },
  });

  // Fornecedores
  await prisma.user.create({
    data: {
      name: 'João Souza',
      email: 'joao@ecoplast.com.br',
      passwordHash: hashedPassword,
      role: Role.SUPPLIER,
      companyId: plasticSupplier.id,
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Maria Santos',
      email: 'maria@colortint.com.br',
      passwordHash: hashedPassword,
      role: Role.SUPPLIER,
      companyId: paintSupplier.id,
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      name: 'Pedro Oliveira',
      email: 'pedro@ecopack.com.br',
      passwordHash: hashedPassword,
      role: Role.SUPPLIER,
      companyId: packagingSupplier.id,
      isActive: true,
    },
  });

  // Operador (PROVENI)
  const operator = await prisma.user.create({
    data: {
      name: 'Ana Ferreira',
      email: 'ana@proveni.com',
      passwordHash: hashedPassword,
      role: Role.OPERATOR,
      companyId: proveniCompany.id,
      isActive: true,
    },
  });

  // Especialista (PROVENI)
  const specialist = await prisma.user.create({
    data: {
      name: 'Dr. Ricardo Mendes',
      email: 'ricardo@proveni.com',
      passwordHash: hashedPassword,
      role: Role.SPECIALIST,
      companyId: proveniCompany.id,
      isActive: true,
    },
  });

  // Admin
  const admin = await prisma.user.create({
    data: {
      name: 'Admin System',
      email: 'admin@proveni.com',
      passwordHash: hashedPassword,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log(`  ✅ ${await prisma.user.count()} usuários criados`);

  // ============================================================
  // 4. CRIAR RELAÇÕES ENTRE EMPRESAS (FORNECEDORES)
  // ============================================================
  console.log('\n🔗 Vinculando fornecedores ao exportador...');

  await prisma.companySupplier.createMany({
    data: [
      {
        companyId: exportador.id,
        supplierId: plasticSupplier.id,
        status: 'ACTIVE',
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
      {
        companyId: exportador.id,
        supplierId: paintSupplier.id,
        status: 'ACTIVE',
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
      {
        companyId: exportador.id,
        supplierId: packagingSupplier.id,
        status: 'ACTIVE',
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
    ],
  });
  console.log('  ✅ 3 fornecedores vinculados ao exportador');

  // ============================================================
  // 5. CRIAR DOCUMENTOS DOS FORNECEDORES (SOMENTE DOCUMENTOS!)
  // ============================================================
  console.log('\n📄 Criando documentos dos fornecedores...');
  console.log(
    '   ⚠️ NÃO serão criados lotes agora! Eles serão criados automaticamente pelo Operador.',
  );

  await prisma.document.createMany({
    data: [
      {
        filename: 'NF_EcoPlast_001.pdf',
        originalName: 'Nota Fiscal - Plástico PP',
        supplierId: plasticSupplier.id,
        docType: DocumentType.INVOICE,
        processingStatus: DocumentStatus.PENDING, // Aguardando processamento
        ipfsHash: 'QmX5gHk8x3Yz7Lp2Wm9Rq4Nt6Jv8Bc2Df1Gh3Jk5Lm7',
        documentHash: 'abc123def456',
        isValidated: false,
        uploadedAt: new Date(),
        uploadedById: operator.id,
      },
      {
        filename: 'NF_ColorTint_001.pdf',
        originalName: 'Nota Fiscal - Tinta Acrílica',
        supplierId: paintSupplier.id,
        docType: DocumentType.INVOICE,
        processingStatus: DocumentStatus.PENDING,
        ipfsHash: 'QmY6iJ9y4Za8Kq3Xn0Sp5Ou7Lw9Cd3Eg2Hk4Jm6Np8',
        documentHash: 'def456ghi789',
        isValidated: false,
        uploadedAt: new Date(),
        uploadedById: operator.id,
      },
      {
        filename: 'NF_EcoPack_001.pdf',
        originalName: 'Nota Fiscal - Caixa de Papelão',
        supplierId: packagingSupplier.id,
        docType: DocumentType.INVOICE,
        processingStatus: DocumentStatus.PENDING,
        ipfsHash: 'QmZ7kJ0z5Ab9Lr4Yo1Tq6Pv8Mx0De4Fh3Il5Kn7Or9',
        documentHash: 'ghi789jkl012',
        isValidated: false,
        uploadedAt: new Date(),
        uploadedById: operator.id,
      },
    ],
  });
  console.log(
    `  ✅ ${await prisma.document.count()} documentos criados (aguardando extração)`,
  );

  // ============================================================
  // 6. CRIAR LOTE FINAL (EXEMPLO PARA TESTE)
  // ============================================================
  console.log('\n🎯 Criando lote final de exemplo...');

  const finalBatch = await prisma.batch.create({
    data: {
      batchId: 'TOY-2025-001',
      productName: 'Boneco Aventura - Edição Limitada',
      productDescription: 'Boneco articulado 30cm, conforme normas CE/ROHS',
      quantity: 5000,
      unit: 'unidades',
      ncmCode: '9503.00',
      co2Emitted: 3250,
      co2PerUnit: 0.65,
      isCompliant: true,
      companyId: exportador.id,
      status: 'COMPLETED',
      blockchainTxHash: '0x71a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0',
      blockchainRegisteredAt: new Date(),
      registeredAt: new Date(),
    },
  });

  // Vincular fornecedores ao lote final
  await prisma.batchSupplier.createMany({
    data: [
      {
        batchId: finalBatch.id,
        supplierId: plasticSupplier.id,
        productName: 'Plástico PP',
        quantity: 5000,
        unit: 'kg',
        co2Emitted: 1250,
      },
      {
        batchId: finalBatch.id,
        supplierId: paintSupplier.id,
        productName: 'Tinta Acrílica',
        quantity: 500,
        unit: 'litros',
        co2Emitted: 500,
      },
      {
        batchId: finalBatch.id,
        supplierId: packagingSupplier.id,
        productName: 'Caixa de Papelão',
        quantity: 5000,
        unit: 'unidades',
        co2Emitted: 300,
      },
    ],
  });

  console.log(`  ✅ Lote final criado: ${finalBatch.batchId}`);
  console.log(
    `  ✅ ${await prisma.batchSupplier.count()} fornecedores vinculados`,
  );

  // ============================================================
  // 7. RESUMO FINAL
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA EXECUÇÃO:');
  console.log('='.repeat(60));
  console.log(`🏢 Empresas: ${await prisma.company.count()}`);
  console.log(`👤 Usuários: ${await prisma.user.count()}`);
  console.log(`📄 Documentos (pendentes): ${await prisma.document.count()}`);
  console.log(`📦 Lotes finais: ${await prisma.batch.count()}`);
  console.log(`🔗 Relações: ${await prisma.batchSupplier.count()}`);
  console.log('='.repeat(60));

  console.log('\n🔑 CREDENCIAIS DE ACESSO:');
  console.log('='.repeat(60));
  console.log(`📧 Manager (Exportador): ${manager.email} / 123456`);
  console.log(`📧 Operador: ${operator.email} / 123456`);
  console.log(`📧 Especialista: ${specialist.email} / 123456`);
  console.log(`📧 Admin: ${admin.email} / 123456`);
  console.log('='.repeat(60));

  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('='.repeat(60));
  console.log('1. Operador deve extrair dados dos documentos pendentes');
  console.log('2. Operador valida → sistema cria lotes automaticamente');
  console.log('3. Especialista valida documentos');
  console.log('4. Manager cria lotes finais ou usa o existente');
  console.log('5. Especialista registra lote final na blockchain');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
