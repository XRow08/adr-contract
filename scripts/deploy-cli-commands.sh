#!/bin/bash

# Definir cores para o terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================${NC}"
echo -e "${BLUE}   DEPLOY E TESTE DO PROGRAMA ADR   ${NC}"
echo -e "${BLUE}====================================${NC}"

# 1. Build e deploy do programa
echo -e "\n${YELLOW}Compilando e fazendo deploy do programa...${NC}"
anchor build
anchor deploy --provider.cluster devnet

# 2. Salvar o ID do programa e outras informações importantes
PROGRAM_ID="AU11ExEVfwpRBaWgBXRKXHyHa3dAHCQsX6cEoFJxceVq"
WALLET=$(solana address)

echo -e "\n${GREEN}Programa implantado com sucesso!${NC}"
echo -e "ID do Programa: ${PROGRAM_ID}"
echo -e "Carteira: ${WALLET}"

# 3. Inicializar a coleção
echo -e "\n${YELLOW}Inicializando a coleção...${NC}"
anchor exec-command -- initialize-collection --program-id "${PROGRAM_ID}" \
  --name "ADR Collection" \
  --symbol "ADRC" \
  --uri "https://arweave.net/your-metadata-uri"

# 4. Criar token de pagamento
echo -e "\n${YELLOW}Criando token de pagamento...${NC}"
TOKEN_MINT=$(spl-token create-token --decimals 9 | grep "Creating token" | awk '{print $3}')
echo "Token Mint criado: ${TOKEN_MINT}"

# 5. Criar conta associada para o token
echo -e "\n${YELLOW}Criando conta associada para o token...${NC}"
spl-token create-account "${TOKEN_MINT}"

# 6. Mintar alguns tokens para a carteira
echo -e "\n${YELLOW}Mintando tokens para a carteira...${NC}"
spl-token mint "${TOKEN_MINT}" 1000000000 # 1000 tokens com 9 casas decimais

# 7. Configurar o token de pagamento no programa
echo -e "\n${YELLOW}Configurando o token de pagamento no programa...${NC}"
anchor exec-command -- set-payment-token --program-id "${PROGRAM_ID}" \
  --payment-token-mint "${TOKEN_MINT}"

# 8. Configurar o sistema de staking
echo -e "\n${YELLOW}Configurando o sistema de staking...${NC}"
anchor exec-command -- configure-staking --program-id "${PROGRAM_ID}" \
  --enabled true \
  --reward-rate 1000

# 9. Inicializar a reserva de recompensas
echo -e "\n${YELLOW}Inicializando a reserva de recompensas...${NC}"
anchor exec-command -- initialize-reward-reserve --program-id "${PROGRAM_ID}"

# 10. Depositar tokens na reserva de recompensas
echo -e "\n${YELLOW}Depositando tokens na reserva de recompensas...${NC}"
anchor exec-command -- deposit-reward-reserve --program-id "${PROGRAM_ID}" \
  --amount 100000000000 # 100 tokens

echo -e "\n${GREEN}====================================${NC}"
echo -e "${GREEN}   DEPLOY E CONFIGURAÇÃO CONCLUÍDOS   ${NC}"
echo -e "${GREEN}====================================${NC}"
echo -e "\nAgora você pode começar a usar o programa na devnet!" 