import { PublicKey } from "@solana/web3.js";

export const TESTNET_CONFIG = {
    // Configurações do programa
    PROGRAM_ID: "GKf6NkHokaNXcov4kgPqftFrd9QfJMcgRwaCVSWc5yTz",
    
    // Configurações de staking
    STAKING: {
        // Taxa base de recompensa (1000 = 10%)
        BASE_REWARD_RATE: 1000,
        
        // Limite máximo de stake (em tokens)
        MAX_STAKE_AMOUNT: 1_000_000 * 10**9, // 1 milhão de tokens
        
        // Limite mínimo de stake (em tokens)
        MIN_STAKE_AMOUNT: 100 * 10**9, // 100 tokens
        
        // Períodos de staking disponíveis
        PERIODS: {
            DAYS_7: {
                name: "7 dias",
                multiplier: 105, // 5% de bônus
                minAmount: 100 * 10**9, // 100 tokens
            },
            DAYS_14: {
                name: "14 dias",
                multiplier: 110, // 10% de bônus
                minAmount: 500 * 10**9, // 500 tokens
            },
            DAYS_30: {
                name: "30 dias",
                multiplier: 120, // 20% de bônus
                minAmount: 1000 * 10**9, // 1000 tokens
            },
            DAYS_90: {
                name: "90 dias",
                multiplier: 140, // 40% de bônus
                minAmount: 5000 * 10**9, // 5000 tokens
            },
            DAYS_180: {
                name: "180 dias",
                multiplier: 150, // 50% de bônus
                minAmount: 10000 * 10**9, // 10000 tokens
            },
        },
        
        // Taxa de cooldown após unstake (em segundos)
        COOLDOWN_PERIOD: 24 * 60 * 60, // 24 horas
        
        // Taxa de penalidade para unstake antecipado (em porcentagem)
        EARLY_UNSTAKE_PENALTY: 10, // 10%
    },
    
    // Configurações de NFT
    NFT: {
        // Custo base para mintar NFT (em tokens)
        BASE_MINT_COST: 1000 * 10**9, // 1000 tokens
        
        // Limite máximo de NFTs por wallet
        MAX_NFTS_PER_WALLET: 10,
        
        // URI base para metadados
        BASE_URI: "https://testnet-metadata.adrtoken.com/",
    },
    
    // Configurações de segurança
    SECURITY: {
        // Número máximo de tentativas de stake por wallet por dia
        MAX_STAKE_ATTEMPTS_PER_DAY: 10,
        
        // Número máximo de tentativas de unstake por wallet por dia
        MAX_UNSTAKE_ATTEMPTS_PER_DAY: 5,
        
        // Tempo mínimo entre operações (em segundos)
        MIN_OPERATION_INTERVAL: 60, // 1 minuto
        
        // Lista de endereços bloqueados
        BLOCKED_ADDRESSES: [] as PublicKey[],
    },
    
    // Configurações de monitoramento
    MONITORING: {
        // Intervalo de verificação de eventos (em segundos)
        EVENT_CHECK_INTERVAL: 60,
        
        // Número máximo de eventos a serem processados por vez
        MAX_EVENTS_PER_BATCH: 100,
        
        // Tempo de retenção de logs (em dias)
        LOG_RETENTION_DAYS: 30,
    },
    
    // Configurações de rede
    NETWORK: {
        // URL do RPC
        RPC_URL: "https://api.testnet.solana.com",
        
        // Commitment level
        COMMITMENT: "confirmed",
        
        // Timeout para transações (em milissegundos)
        TRANSACTION_TIMEOUT: 60000, // 60 segundos
        
        // Número máximo de retentativas para transações
        MAX_RETRIES: 3,
    },
    
    // Configurações de administração
    ADMIN: {
        // Endereço do admin principal (usando uma chave de exemplo válida)
        MAIN_ADMIN: new PublicKey("SoLn1rHfhgxXBqU1PkBi7QsipfMZmR6SXY6EQH1Bp4R"),
        
        // Endereços dos admins secundários
        SECONDARY_ADMINS: [] as PublicKey[],
        
        // Número mínimo de admins necessários para operações críticas
        MIN_ADMINS_FOR_CRITICAL_OPERATIONS: 2,
        
        // Tempo de espera para operações críticas (em segundos)
        CRITICAL_OPERATION_DELAY: 24 * 60 * 60, // 24 horas
    },
};

// Função para validar a configuração
export function validateConfig() {
    const config = TESTNET_CONFIG;
    
    // Validar taxas de recompensa
    if (config.STAKING.BASE_REWARD_RATE <= 0 || config.STAKING.BASE_REWARD_RATE > 10000) {
        throw new Error("Taxa base de recompensa inválida");
    }
    
    // Validar limites de stake
    if (config.STAKING.MAX_STAKE_AMOUNT <= config.STAKING.MIN_STAKE_AMOUNT) {
        throw new Error("Limite máximo de stake deve ser maior que o mínimo");
    }
    
    // Validar períodos de staking
    for (const [period, settings] of Object.entries(config.STAKING.PERIODS)) {
        if (settings.multiplier <= 100) {
            throw new Error(`Multiplicador inválido para período ${period}`);
        }
        if (settings.minAmount <= 0) {
            throw new Error(`Valor mínimo inválido para período ${period}`);
        }
    }
    
    // Validar configurações de segurança
    if (config.SECURITY.MAX_STAKE_ATTEMPTS_PER_DAY <= 0) {
        throw new Error("Número máximo de tentativas de stake inválido");
    }
    if (config.SECURITY.MIN_OPERATION_INTERVAL <= 0) {
        throw new Error("Intervalo mínimo entre operações inválido");
    }
    
    // Validar configurações de rede
    if (!config.NETWORK.RPC_URL) {
        throw new Error("URL do RPC não configurada");
    }
    if (config.NETWORK.TRANSACTION_TIMEOUT <= 0) {
        throw new Error("Timeout de transação inválido");
    }
    
    // Validar configurações de admin
    if (!config.ADMIN.MAIN_ADMIN) {
        throw new Error("Admin principal não configurado");
    }
    if (config.ADMIN.MIN_ADMINS_FOR_CRITICAL_OPERATIONS <= 0) {
        throw new Error("Número mínimo de admins inválido");
    }
    
    return true;
}

// Função para obter configurações específicas para um ambiente
export function getEnvironmentConfig(environment: 'testnet' | 'devnet' | 'mainnet') {
    const baseConfig = { ...TESTNET_CONFIG };
    
    switch (environment) {
        case 'testnet':
            return {
                ...baseConfig,
                NETWORK: {
                    ...baseConfig.NETWORK,
                    RPC_URL: "https://api.testnet.solana.com",
                },
            };
        case 'devnet':
            return {
                ...baseConfig,
                NETWORK: {
                    ...baseConfig.NETWORK,
                    RPC_URL: "https://api.devnet.solana.com",
                },
            };
        case 'mainnet':
            return {
                ...baseConfig,
                NETWORK: {
                    ...baseConfig.NETWORK,
                    RPC_URL: "https://api.mainnet-beta.solana.com",
                },
                // Ajustar limites para mainnet
                STAKING: {
                    ...baseConfig.STAKING,
                    MAX_STAKE_AMOUNT: 10_000_000 * 10**9, // 10 milhões de tokens
                },
            };
        default:
            throw new Error(`Ambiente ${environment} não suportado`);
    }
} 