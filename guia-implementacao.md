# Guia de Implementação do Contrato no Frontend

Este guia mostra como implementar o contrato Solana `adr_token_mint` em um aplicativo frontend.

## Pré-requisitos

1. Node.js instalado
2. Contrato Anchor compilado e implantado na rede Solana
3. Acesso ao IDL gerado pela compilação do contrato

## Configuração do Projeto

### 1. Instalar Dependências

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token 
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @solana/wallet-adapter-base
```

### 2. Obter o IDL do Contrato

Após compilar seu contrato Anchor, o IDL será gerado em:

```
target/idl/adr_token_mint.json
```

Copie este arquivo para seu projeto frontend em `src/idl/adr_token_mint.json`.

## Passos para Implementação

### 1. Configurar Provedores Solana

Configure os provedores de conexão e carteira como mostrado em `frontend-provider-setup.js`.

### 2. Implementar Funções para Interagir com o Contrato

Para cada instrução do contrato, crie uma função correspondente que configure a transação e a envie:

1. **Inicializar Coleção**:
   - Cria keypairs para a mint, metadata e config
   - Chama `program.methods.initializeCollection()`

2. **Configurar Token de Pagamento**:
   - Chama `program.methods.setPaymentToken()`
   - Requer privilégios de admin

3. **Mintar NFT**:
   - Cria keypairs para a mint e metadata do NFT
   - Chama `program.methods.mintNft()`

4. **Mintar NFT com Pagamento**:
   - Similar à mintagem normal, mas inclui token de pagamento
   - Chama `program.methods.mintNftWithPayment()`

### 3. Fluxo Completo de Uso

1. Conectar carteira (Phantom, Solflare, etc.)
2. Inicializar uma coleção de NFTs
3. Configurar um token de pagamento (opcional)
4. Mintar NFTs simples ou com pagamento

## Notas Importantes

1. **Segurança das Chaves**:
   - Gere keypairs no cliente apenas para novas contas
   - Nunca exponha chaves privadas

2. **Gestão de Contas**:
   - Armazene endereços de contas importantes (ex: metadata da coleção)
   - Use armazenamento local ou banco de dados

3. **Handling de Erros**:
   - Implemente tratamento adequado de erros
   - Informe ao usuário quando uma transação falhar

4. **Otimização de Taxas**:
   - Combine instruções quando possível para reduzir taxas

## Exemplo de Uso

```jsx
// Inicializar uma coleção
await initializeCollection();

// Definir token de pagamento
await setPaymentToken("TokenMintAddress");

// Mintar NFT normal
await mintNFT("NFT #1", "NFT1", "https://uri-metadados.com");

// Mintar NFT com pagamento
await mintNFTWithPayment("NFT Pago #1", "PNFT1", "https://uri-metadados.com", 1000, "TokenMintAddress");
```

Para mais detalhes, consulte os arquivos de exemplo:
- `frontend-example.js` - Componente principal de mintagem
- `frontend-provider-setup.js` - Configuração de provedores Solana
- `frontend-app-setup.js` - Integração em uma aplicação React 