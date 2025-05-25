# ADR Token Mint - Sistema de NFTs e Staking

Este projeto implementa um programa Solana que permite:

1. Criar e gerenciar uma coleção de NFTs
2. Mint de NFTs com pagamento em tokens
3. Sistema de staking com recompensas escalonadas por tempo

## Pré-requisitos

- Node.js e npm instalados
- Solana CLI instalado
- Anchor Framework (versão 0.31.1)
- Uma wallet Solana com SOL na devnet para testes

## Setup do Ambiente

```bash
# Instalar dependências
npm install

# Construir o programa
anchor build

# Configurar sua wallet para testes (se ainda não tiver uma)
solana-keygen new -o wallet-dev.json

# Obter SOL da devnet para sua wallet
solana airdrop 2 $(solana address -k wallet-dev.json) --url devnet
```

## Deploy e Configuração

O projeto já está configurado para deploy na devnet. Veja o arquivo DEPLOYMENT_SUMMARY.md para mais detalhes.

```bash
# Deploy do programa na devnet
node scripts/deploy-program.js

# Criar um token para testes (se não for usar um token existente)
node scripts/create-token.js

# OU configurar um token Pumpfun existente
# Edite o arquivo scripts/set-pumpfun-token.js primeiro
node scripts/set-pumpfun-token.js

# Configurar uma carteira personalizada como reserva
# Edite o arquivo scripts/set-custom-reserve.js primeiro
node scripts/set-custom-reserve.js

# Inicializar a reserva de recompensas
node scripts/initialize-reward-reserve.js

# Depositar tokens na reserva para recompensas
node scripts/deposit-rewards.js

# Configurar o sistema de staking
node scripts/configure-staking.js
```

## Testar Staking e Unstaking

Para testar o sistema de staking, você pode usar os scripts:

```bash
# Fazer stake de tokens
node scripts/test-stake-tokens.js

# Aguardar o período de staking terminar (os períodos de teste são curtos)
# 1, 2, 5, 10 ou 30 minutos

# Fazer unstake e receber recompensas
node scripts/test-unstake-tokens.js
```

### Parâmetros Configuráveis

Você pode editar estes scripts para ajustar:

- **Quantidade de tokens**: Modifique a variável `amount` em test-stake-tokens.js
- **Período de staking**: Altere para `StakingPeriod.Minutes1`, `StakingPeriod.Minutes2`, etc.
- **Taxa de recompensa**: Ajuste `REWARD_RATE` em configure-staking.js (10000 = 100%)

## Estrutura do Programa

- `programs/adr_token_mint/src/lib.rs`: Implementação do programa Solana/Anchor
- `scripts/`: Scripts de deploy e configuração
- `config/`: Arquivos de configuração e informações de deploy

## Períodos de Staking e Multiplicadores

| Período | Multiplicador de Recompensa |
|---------|----------------------------|
| 1 minuto | 1.05x (5% de bônus) |
| 2 minutos | 1.10x (10% de bônus) |
| 5 minutos | 1.20x (20% de bônus) |
| 10 minutos | 1.40x (40% de bônus) |
| 30 minutos | 1.50x (50% de bônus) |

## Detalhes de Implementação

- Tokens são queimados (burned) quando um NFT é mintado
- Tokens staked são bloqueados pelo período escolhido
- Recompensas são calculadas com base no período e na taxa configurada
- Ao fazer unstake, o usuário recebe seus tokens originais + recompensas
- Recompensas são transferidas da reserva para o usuário

## Segurança e Administração

- O admin tem controle sobre configurações do sistema
- O sistema pode ser pausado para emergências
- Taxas de recompensa podem ser ajustadas
- Os multiplicadores por período são definidos no programa

## Status Atual

- ✅ Token de pagamento (FPP2rgo9dP2VUoUgacQS8hZGkeKdVhEJzqugRsGpJSe8) criado com sucesso
- ✅ Informações da coleção NFT preparadas
- ❌ Inicialização on-chain da coleção pendente (devido a problemas de compatibilidade do Anchor)
- ❌ Configuração on-chain do token de pagamento pendente

## Desafios Encontrados

Ao tentar inicializar o programa, encontramos os seguintes problemas:

1. **Incompatibilidade com a versão do Anchor**
   - Erro "Cannot use 'in' operator to search for 'vec' in pubkey"
   - A versão atual do Anchor não é compatível com algumas chamadas no código

2. **Dificuldade em serializar instruções diretamente**
   - Tentativas de usar web3.js diretamente para inicializar o programa encontraram erros
   - A serializaçao correta das instruções Anchor requer conhecimento detalhado do programa

## Soluções Propostas

### Opção 1: Migração para Novo Projeto (Recomendada)

Esta opção cria um novo projeto Anchor com a versão mais recente e migra o programa para ele.

```bash
# Gerar script de migração
anchor run migrate

# Executar o script
bash migrate.sh

# Após a migração, no novo diretório:
cd ../novo-adr-token
anchor build
anchor deploy

# Inicializar o programa
anchor run init-collection
anchor run config-token
```

### Opção 2: Atualizar o Anchor Atual

```bash
anchor run update
yarn install
npm install -g @project-serum/anchor-cli@^0.26.0
anchor build
```

### Opção 3: Inicialização Manual Direta

```bash
anchor run export-keypairs
anchor run direct-init
anchor run direct-config
```

## Comandos Disponíveis

Para ver todos os comandos disponíveis, consulte o arquivo Anchor.toml. Alguns dos mais importantes:

- `anchor run create-token` - Cria o token de pagamento
- `anchor run check` - Verifica o estado atual do programa
- `anchor run direct-guide` - Mostra o guia atualizado com instruções detalhadas
- `anchor run migrate` - Gera o script de migração
- `anchor run simple-config` - Registra informações do token de forma offline

## Estrutura do Token

- **Token Mint:** FPP2rgo9dP2VUoUgacQS8hZGkeKdVhEJzqugRsGpJSe8
- **Decimais:** 9
- **Quantidade Inicial:** 10,000,000
- **Proprietário:** Wallet do desenvolvedor

## Próximos Passos

1. Seguir a estratégia de migração para criar um novo projeto com Anchor atualizado
2. Concluir a inicialização da coleção
3. Configurar o token de pagamento no programa
4. Testar a funcionalidade de mintagem de NFTs
5. Configurar e testar o sistema de staking

## Arquivos Importantes

- `programs/adr_token_mint/src/lib.rs` - Código do contrato inteligente
- `scripts/` - Scripts auxiliares para implantação e inicialização
- `token-info.json` - Informações do token de pagamento
- `collection-info.json` - Informações da coleção NFT
- `migrate.sh` - Script de migração para novo projeto

## Recursos

- [Documentação do Anchor](https://www.anchor-lang.com/)
- [Documentação do Solana](https://docs.solana.com/)
- [SPL Token](https://spl.solana.com/token) 