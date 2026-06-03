# Proveni - Plataforma de Rastreabilidade e Conformidade ESG com Blockchain

**Proveni** é uma plataforma completa de **rastreabilidade de exportação** que combina **Inteligência Artificial**, **OCR avançado** e **Blockchain** para garantir transparência, conformidade ESG e emissão de certificados digitais (NFTs) para produtos exportados.

Foco principal: Exportadores brasileiros que precisam comprovar origem, pegada de carbono e conformidade com regulamentações internacionais (ex: European Green Deal, CBAM).

---

## ✨ Funcionalidades Principais

### 🔹 Fluxo Completo da Cadeia de Suprimentos

- Cadastro de empresas (Exportadores e Fornecedores)
- Vinculação de fornecedores
- Upload de documentos (NF-e, relatórios de carbono, certificados)
- Extração automática de dados via **IA + OCR**
- Criação e gestão de lotes de exportação
- Validação por especialistas
- Registro imutável na **Blockchain**
- Emissão de **NFTs de Certificado de Conformidade**

### 🤖 Inteligência Artificial

- Suporte a múltiplos provedores: **Groq (Llama)**, **OpenAI**, **Gemini** e **Claude**
- Extração inteligente de: número da NF, produto, quantidade, fornecedor, CNPJ, CO₂ emitido, valor, data, etc.
- OCR robusto para PDFs escaneados e nativos

### ⛓️ Blockchain & Web3

- Registro de lotes na rede Ethereum (Sepolia)
- Auditoria por especialistas (role `SPECIALIST`)
- Emissão automática de NFT ao aprovar lote
- Verificação pública via QR Code
- Transparência total para alfândega e compradores internacionais

### 👥 Sistema de Roles

| Role           | Permissões Principais                      |
| -------------- | ------------------------------------------ |
| **SUPPLIER**   | Enviar documentos                          |
| **OPERATOR**   | Processar e extrair dados                  |
| **SPECIALIST** | Validar, auditar e registrar na blockchain |
| **MANAGER**    | Gerir lotes, fornecedores e dashboard      |
| **ADMIN**      | Controle total da plataforma               |

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: NestJS + TypeScript
- **Banco de Dados**: PostgreSQL + Prisma ORM
- **IA/OCR**: Tesseract.js, pdf2json, múltiplos LLMs
- **Blockchain**: Ethers.js + Smart Contract (Solidity)
- **Armazenamento Descentralizado**: IPFS via Pinata
- **Autenticação**: JWT + Roles
- **Upload**: Multer + memória

---

## 📁 Estrutura de Pastas (Principais)

```
src/
├── ai/              # Integração com LLMs e extração
├── ocr/             # Processamento de documentos
├── blockchain/      # Integração Ethereum + Smart Contract
├── ipfs/            # Upload para Pinata
├── documents/       # Upload, extração e validação
├── batches/         # Gestão de lotes
├── manager/         # Fluxos do gestor
├── auth/            # Autenticação
├── prisma/          # Schema e migrations
└── common/          # Guards, decorators, etc.
```

---

## 🚀 Como Rodar o Projeto

### 1. Clone o repositório

```bash
git clone <url-do-seu-repositorio>
cd proveni-backend
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o ambiente

Crie um arquivo `.env` na raiz:

```env
# ==================== DATABASE ====================
DATABASE_URL="postgresql://usuario:senha@localhost:5432/nome_do_banco?schema=public"

# ==================== AUTHENTICATION ====================
JWT_SECRET="seu-secret-super-seguro-aqui-mude-para-um-valor-forte"
JWT_EXPIRES_IN="7d"

# ==================== IPFS (Pinata) ====================
PINATA_API_KEY="sua_chave_pinata_aqui"
PINATA_SECRET_KEY="seu_secret_pinata_aqui"

# ==================== IA / LLM Providers ====================
OPENAI_API_KEY="sk-..."
GEMINI_API_KEY="AIzaSy..."
GROQ_API_KEY="gsk_..."
CLAUDE_API_KEY="sk-ant-..."

# ==================== BLOCKCHAIN (Sepolia) ====================
BLOCKCHAIN_RPC_URL=https://sepolia.infura.io/v3/SEU_INFURA_PROJECT_ID
BLOCKCHAIN_PRIVATE_KEY=0xSEU_PRIVATE_KEY_AQUI
CONTRACT_ADDRESS=0xSEU_CONTRATO_AQUI
FIRST_AUDITOR_ADDRESS=0xENDERECO_DO_AUDITOR

# ==================== SERVER ====================
PORT=3001
```

### 4. Rode as migrações

```bash
npx prisma generate
npx prisma migrate dev
```

# 4.1 (Opcional) Popule o banco com dados iniciais (se tiver seed)

npx prisma db seed

### 5. Inicie o servidor

```bash
npm run start:dev
```

---

## 📊 Principais Fluxos

### Fluxo Completo de Exportação

1. **Fornecedor** → Faz upload da Nota Fiscal
2. **Operator** → Sistema extrai dados via IA/OCR
3. **Manager** → Cria lote agregando vários fornecedores
4. **Specialist** → Valida conformidade (CO₂, documentos)
5. **Specialist** → Registra na blockchain + emite NFT
6. **Comprador/Alfândega** → Verifica via QR Code (público)

---

## 🔗 Endpoints Principais

### Documentos

- `POST /documents/upload` → Upload + IPFS
- `POST /documents/:id/extract-ai` → Extração com IA
- `POST /documents/:id/validate` → Validação

### Lotes

- `POST /batches` → Criar lote
- `POST /manager/batches/create` → Lote final com fornecedores
- `POST /batches/:batchId/register-blockchain` → Registrar

### Blockchain (Público)

- `GET /blockchain/batch/:batchId` → Consultar lote
- `GET /blockchain/batch/:batchId/quick` → Verificação rápida

---

## 📈 Próximos Passos (Roadmap Sugerido)

- [ ] Dashboard frontend (React/Next.js)
- [ ] Notificações em tempo real (WebSocket)
- [ ] Relatórios PDF automáticos
- [ ] Integração com sistemas fiscais (SEFAZ)
- [ ] Suporte a múltiplas blockchains
- [ ] Auditoria automática via IA

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir **Issues** e **Pull Requests**.

---

## 📄 Licença

Este projeto é de propriedade intelectual. Uso interno ou sob licença comercial.

---

**Desenvolvido com ❤️ para um comércio internacional mais transparente e sustentável.**
