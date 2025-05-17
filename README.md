# ADR Token Contract

Este é um contrato inteligente Solana para um sistema de NFTs com pagamento em tokens e staking.

## Funcionalidades

- **Coleção de NFTs**: Inicializa e gerencia uma coleção de NFTs.
- **Mintagem de NFTs**: Permite mintar NFTs individualmente.
- **Pagamento com Tokens**: Permite mintar NFTs com pagamento em tokens.
- **Queima de Tokens**: Queima tokens como parte do processo de pagamento.
- **Sistema de Staking**: Permite fazer stake de tokens por diferentes períodos.
- **Recompensas de Staking**: Diferentes períodos oferecem diferentes multiplicadores de recompensa.
- **Registro de Eventos**: Emite eventos personalizados para transações importantes.

## Períodos de Staking e Recompensas

| Período | Duração | Multiplicador de Recompensa |
|---------|---------|------------------------------|
| Curto   | 7 dias  | 5% de bônus (1.05x)         |
| Médio   | 14 dias | 10% de bônus (1.10x)        |
| Longo   | 30 dias | 20% de bônus (1.20x)        |
| Premium | 90 dias | 40% de bônus (1.40x)        |
| Elite   | 180 dias| 50% de bônus (1.50x)        |

## Arquitetura do Contrato

O contrato utiliza o framework Anchor para Solana e inclui as seguintes contas e estruturas:

### Contas principais
- `NFTMetadata`: Armazena metadados de NFTs
- `ConfigAccount`: Configurações gerais e parâmetros do contrato
- `StakeAccount`: Rastreia informações de staking para cada usuário

### Instruções Principais
- `initialize_collection`: Configura a coleção de NFTs
- `mint_nft`: Minta um NFT simples
- `mint_nft_with_payment`: Minta um NFT com pagamento em tokens
- `stake_tokens`: Faz stake de tokens por um período específico
- `unstake_tokens`: Resgata tokens após o período de staking
- `set_payment_token`: Define o token usado para pagamentos
- `configure_staking`: Configura parâmetros de staking
- `set_emergency_pause`: Pausa o contrato em caso de emergência
- `update_admin`: Atualiza o administrador do contrato
- `update_max_stake_amount`: Altera o valor máximo permitido para stake

## Mecanismos de Segurança

O contrato implementa diversos mecanismos de segurança:

1. **Verificações de Autorização**: Apenas o administrador pode executar funções administrativas
2. **Proteções contra Overflow**: Cálculos matemáticos seguros em todas as operações
3. **Verificações de Entrada**: Validação de todas as entradas do usuário
4. **Limites de Valor**: Restrições nos valores máximos de stake
5. **Pausa de Emergência**: Capacidade de pausar o contrato em caso de problemas
6. **Eventos**: Registro detalhado de operações críticas para auditoria

## Eventos

O contrato emite o seguinte evento personalizado:

### TokenBurnEvent
Registra informações quando tokens são queimados como pagamento:
- `payer`: Endereço da carteira que fez o pagamento
- `token_mint`: Endereço do token que foi queimado
- `amount`: Quantidade de tokens queimados
- `nft_mint`: Endereço do NFT mintado com este pagamento
- `timestamp`: Momento da transação

## Configuração do Ambiente de Desenvolvimento

### Pré-requisitos
- Solana CLI
- Rust
- Anchor Framework
- Node.js e npm

### Instalação

```bash
# Instalar dependências
npm install

# Construir o programa
anchor build

# Implantar o programa
anchor deploy
```

### Testes

```bash
# Executar todos os testes
anchor test

# Executar testes específicos
anchor test -- -k "nome_do_teste"
```

### Testando o Sistema de Staking

O sistema de staking inclui períodos de 7, 14, 30, 90 e 180 dias, cada um com um multiplicador de recompensa diferente. Para testar o unstake, existem duas abordagens:

1. **Em ambiente de desenvolvimento**: Use o arquivo `tests/stake_and_unstake.ts` para simular e visualizar como o unstake funcionaria em diferentes cenários.

2. **Em ambiente de produção**: O fluxo de teste real segue estas etapas:
   - Fazer stake de tokens
   - Esperar o período de staking terminar (7, 14, 30, 90 ou 180 dias)
   - Chamar a função `unstake_tokens`
   - Verificar que os tokens originais foram devolvidos e as recompensas recebidas

#### Demonstração de APY por Período

Para um stake de 1000 tokens com taxa base de 10%:

| Período | Recompensa | Total após período | APY Equivalente |
|---------|------------|-------------------|-----------------|
| 7 dias  | 105 tokens | 1105 tokens        | 260.71%         |
| 14 dias | 110 tokens | 1110 tokens        | 260.71%         |
| 30 dias | 120 tokens | 1120 tokens        | 243.33%         |
| 90 dias | 140 tokens | 1140 tokens        | 162.22%         |
| 180 dias| 150 tokens | 1150 tokens        | 101.39%         |

*Nota: A APY (Annual Percentage Yield) é calculada considerando a composta anual dos retornos.*

## Considerações para Produção

Antes de implantar em produção, recomenda-se:

1. Realizar uma auditoria de segurança com especialistas
2. Executar testes extensivos em ambiente de pré-produção
3. Configurar monitoramento para detectar atividades suspeitas
4. Planejar procedimentos de resposta a incidentes
5. Documentar claramente os riscos para os usuários finais

## Licença

[Inserir informações de licença]

## Contribuições

[Instruções para contribuidores] 