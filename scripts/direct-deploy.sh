#!/bin/bash
set -e

echo "Script de Implantação Direta do ADR Token Mint"
echo "==============================================="
echo

# Verificar se a carteira existe
if [ ! -f "./wallet-dev.json" ]; then
    echo "Carteira não encontrada. Criando uma nova..."
    solana-keygen new --no-bip39-passphrase -o wallet-dev.json
    echo "Nova carteira criada em wallet-dev.json"
fi

# Verificar se está na rede correta
NETWORK=$(solana config get | grep "RPC URL" | awk '{print $3}')
if [[ "$NETWORK" != *"devnet"* ]]; then
    echo "Alterando para a rede devnet..."
    solana config set --url https://api.devnet.solana.com
fi

# Verificar o saldo da carteira
WALLET_ADDRESS=$(solana address -k wallet-dev.json)
echo "Utilizando carteira: $WALLET_ADDRESS"
BALANCE=$(solana balance $WALLET_ADDRESS | awk '{print $1}')
echo "Saldo atual: $BALANCE SOL"

# Solicitar SOL se necessário
if (( $(echo "$BALANCE < 1" | bc -l) )); then
    echo "Saldo baixo. Solicitando SOL do faucet..."
    solana airdrop 2 $WALLET_ADDRESS
    echo "Novo saldo: $(solana balance $WALLET_ADDRESS | awk '{print $1}') SOL"
fi

# Construir o programa
echo "Compilando o programa..."
anchor build

# Criar o token de pagamento se não existir
TOKEN_MINT=$(cat config/deploy-info.json 2>/dev/null | grep paymentTokenMint | cut -d'"' -f4 || echo "")
if [ -z "$TOKEN_MINT" ]; then
    echo "Criando novo token de pagamento..."
    # Executar o script de criação de token e extrair o endereço
    TOKEN_MINT=$(node scripts/create-token.js | grep "Token mint criado:" | awk '{print $4}')
    echo "Token de pagamento criado: $TOKEN_MINT"
else
    echo "Usando token de pagamento existente: $TOKEN_MINT"
fi

# Configurar o sistema de staking
echo "Configurando sistema de staking..."
node scripts/configure-staking.js || true

# Inicializar a reserva de recompensas
echo "Inicializando reserva de recompensas..."
node scripts/initialize-reward-reserve.js || true

# Depositar tokens na reserva
echo "Depositando tokens na reserva de recompensas..."
node scripts/deposit-rewards.js || true

# Testar o staking
echo "Testando stake de tokens..."
node scripts/test-stake-tokens.js || true

# Esperar o período de staking (1 minuto)
echo "Aguardando 90 segundos para período de staking..."
sleep 90

# Testar o unstaking
echo "Testando unstake de tokens..."
node scripts/test-unstake-tokens.js || true

echo
echo "Implantação e testes concluídos!"
echo "Verifique os resultados nos logs acima." 