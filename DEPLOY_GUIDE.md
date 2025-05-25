# Guia de Deploy e Inicialização do Programa ADR Token Mint

Este guia irá ajudá-lo a fazer o deploy e a inicialização do programa ADR Token Mint na Devnet do Solana.

## Pré-requisitos

Certifique-se de ter instalado:

- Solana CLI (versão 1.10.0 ou superior)
- Anchor CLI (versão 0.26.0 ou superior)
- Node.js (versão 14 ou superior)
- Yarn ou NPM

## Método Simples (Recomendado)

O método mais simples é usar o script direto que criamos:

```bash
# Verificar se está na Devnet
solana config set --url https://api.devnet.solana.com

# Executar o script de deploy direto
./scripts/direct-deploy.sh
```

Este script fará o build, deploy e criará um token SPL para pagamento automaticamente.

## Método Detalhado

Se preferir fazer o processo passo a passo, siga as instruções abaixo:

### 1. Configuração inicial

Primeiro, certifique-se de que sua configuração Solana está apontando para a Devnet:

```bash
solana config set --url https://api.devnet.solana.com
```

### 2. Construir o programa

Execute o comando de build do Anchor:

```bash
anchor build
```

### 3. Deploy do programa

Faça o deploy do programa na Devnet:

```bash
anchor deploy --provider.cluster devnet
```

### 4. Criar token de pagamento

Para criar o token SPL que será usado como token de pagamento:

```bash
# Criar o token com 9 casas decimais
TOKEN_MINT=$(spl-token create-token --decimals 9 | grep "Creating token" | cut -d " " -f3)
echo "Token mint criado: $TOKEN_MINT"

# Criar conta associada
spl-token create-account $TOKEN_MINT

# Mintar tokens para teste
spl-token mint $TOKEN_MINT 1000000000000 # 1000 tokens
```

### 5. Configurar token de pagamento no programa

Edite o arquivo `scripts/set-payment-token.js` e atualize o valor de `NEW_PAYMENT_TOKEN` com o endereço do token que você criou. Em seguida, execute:

```bash
node scripts/set-payment-token.js
```

### 6. Configurar sistema de staking (opcional)

Se quiser ativar o sistema de staking, você precisará criar scripts personalizados baseados no código existente para realizar essas operações, devido a limitações de compatibilidade com a versão atual do Anchor.

## Testando o programa

Após o deploy, você pode testar o programa:

1. **Mintar um NFT**: Crie um script para chamar a função `mintNftWithPayment`
2. **Fazer stake de tokens**: Crie um script para chamar a função `stakeTokens`
3. **Resgate de tokens com recompensa**: Crie um script para chamar a função `unstakeTokens`

## Observações

- Todos os comandos devem ser executados a partir do diretório raiz do projeto.
- Certifique-se de ter SOL suficiente na sua carteira para pagar as taxas de transação.
- Se você encontrar algum erro durante o processo, verifique os logs e tente novamente o comando específico.
- As informações de deploy são salvas em `config/deploy-info.json` para referência futura.

## Resolução de problemas

1. **Erro de versão do Anchor**: Se encontrar erros relacionados à versão do Anchor, adicione `anchor_version = "0.31.1"` (ou sua versão atual) ao arquivo `Anchor.toml`.

2. **Erro de assinatura**: Problemas com assinatura de PDAs geralmente indicam que a implementação do cliente não está alinhada com a implementação do programa. Considere usar a CLI diretamente para interagir com o programa.

3. **Erro de transação expirada**: Aumente o timeout nas configurações do provider ou tente novamente. 