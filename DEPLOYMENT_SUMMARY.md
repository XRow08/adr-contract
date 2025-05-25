# Resumo do Deploy do Programa ADR Token Mint

## Informações do Deploy

- **ID do Programa**: `AU11ExEVfwpRBaWgBXRKXHyHa3dAHCQsX6cEoFJxceVq`
- **Token de Pagamento**: `Z3LBbRrRpZ5y4oPb8kNhUd55qXeT3LBUodXd4brdxxJ`
- **Rede**: Devnet
- **Carteira de Admin**: `FonqvQ2kFpBFLyNddupwJwuDUcfhHctrbJif43mPqEau`
- **Data do Deploy**: `2025-05-25T01:08:56Z`

## O que foi feito

1. **Build e deploy do programa** na Devnet
2. **Criação de um token SPL** para ser usado como token de pagamento
3. **Criação de conta associada** para o token
4. **Mint de 1000 tokens** para testes

## Usando o Token do Pumpfun

Para usar um token existente do Pumpfun como token de pagamento:

1. **Configure o token do Pumpfun**:
   ```bash
   # Edite o arquivo scripts/set-pumpfun-token.js e substitua o endereço do token
   # Em seguida, execute:
   node scripts/set-pumpfun-token.js
   ```

2. **O que isso faz**:
   - Configura o token do Pumpfun como token de pagamento no programa
   - Quando um usuário compra um NFT, os tokens do Pumpfun serão queimados (burn)
   - Todas as operações de staking usarão o token do Pumpfun

## Usando uma Carteira Personalizada como Reserva

Para usar sua própria carteira como reserva para recompensas de staking:

1. **Configure a carteira de reserva**:
   ```bash
   # Edite o arquivo scripts/set-custom-reserve.js e substitua o endereço da carteira
   # Em seguida, execute:
   node scripts/set-custom-reserve.js
   ```

2. **O que isso faz**:
   - Configura sua carteira como fonte de tokens para recompensas de staking
   - Quando um usuário faz unstake, os tokens de recompensa são transferidos desta carteira
   - Certifique-se de manter saldo suficiente nesta carteira para pagar as recompensas

## Próximos Passos

1. **Testar as Funcionalidades**:
   - **Mint de NFT**: Implemente e teste a função `mintNftWithPayment`
   - **Staking**: Implemente e teste a função `stakeTokens`
   - **Unstaking**: Implemente e teste a função `unstakeTokens`

2. **Para ambiente de produção**:
   - Mude a configuração para mainnet no Anchor.toml
   - Atualize a URL de conexão nos scripts para mainnet
   - Use uma carteira segura para administrar o programa

## Observações

- O programa está configurado para usar a versão do Anchor 0.31.1
- As contas são geradas como PDAs (Program Derived Addresses)
- Os comandos usam a carteira em `wallet-dev.json`
- O programa inclui funções para queimar tokens como pagamento (burn)

## Links Úteis

- [Explorador Solana (Devnet)](https://explorer.solana.com/?cluster=devnet)
- [Documentação do Anchor](https://www.anchor-lang.com/docs/intro)
- [Documentação do Solana](https://docs.solana.com/)
- [Pumpfun (para tokens)](https://www.pump.fun/)

## Resolução de Problemas

Se você encontrar erros durante a configuração, verifique:

1. **Versão do Anchor**: Certifique-se de que a versão corresponde a 0.31.1 no Anchor.toml
2. **Carteira**: Certifique-se de usar a carteira correta (wallet-dev.json)
3. **Rede**: Verifique se está na Devnet com `solana config get`
4. **Saldo**: Certifique-se de ter SOL suficiente com `solana balance` 