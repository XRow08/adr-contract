use anchor_lang::prelude::*;
use crate::{StakeAccount, ConfigAccount, StakingPeriod, NftCounter, NFTMetadata};
use crate::utils::{find_stake_account_pda, calculate_reward};

// Estrutura para informações resumidas de staking
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct StakingSummary {
    pub is_staking: bool,
    pub amount: u64,
    pub start_time: i64,
    pub unlock_time: i64,
    pub period: StakingPeriod,
    pub claimed: bool,
    pub can_unstake: bool,
    pub estimated_reward: u64,
    pub time_remaining: i64,
}

// Estrutura para informações resumidas da configuração
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ConfigSummary {
    pub payment_token_mint: Pubkey,
    pub admin: Pubkey,
    pub staking_enabled: bool,
    pub staking_reward_rate: u64,
    pub max_stake_amount: u64,
    pub emergency_paused: bool,
}

// Função para obter informações de stake de um usuário
pub fn get_stake_summary(
    staker: &Pubkey,
    token_mint: &Pubkey,
    stake_account: Option<Account<StakeAccount>>,
    config: Account<ConfigAccount>,
) -> Result<StakingSummary> {
    // Se não temos uma conta de stake válida, retornamos um sumário vazio
    if stake_account.is_none() {
        return Ok(StakingSummary {
            is_staking: false,
            amount: 0,
            start_time: 0,
            unlock_time: 0,
            period: StakingPeriod::Minutes1,
            claimed: false,
            can_unstake: false,
            estimated_reward: 0,
            time_remaining: 0,
        });
    }
    
    let stake = stake_account.unwrap();
    let clock = Clock::get()?;
    let current_time = clock.unix_timestamp;
    
    // Calcular recompensa estimada
    let multiplier = stake.period.reward_multiplier();
    let estimated_reward = calculate_reward(
        stake.amount,
        config.staking_reward_rate,
        multiplier,
    )?;
    
    // Calcular tempo restante
    let time_remaining = if current_time >= stake.unlock_time {
        0
    } else {
        stake.unlock_time - current_time
    };
    
    Ok(StakingSummary {
        is_staking: stake.amount > 0 && !stake.claimed,
        amount: stake.amount,
        start_time: stake.start_time,
        unlock_time: stake.unlock_time,
        period: stake.period,
        claimed: stake.claimed,
        can_unstake: current_time >= stake.unlock_time && !stake.claimed,
        estimated_reward,
        time_remaining,
    })
}

// Função para obter informações de configuração do programa
pub fn get_config_summary(config: Account<ConfigAccount>) -> ConfigSummary {
    ConfigSummary {
        payment_token_mint: config.payment_token_mint,
        admin: config.admin,
        staking_enabled: config.staking_enabled,
        staking_reward_rate: config.staking_reward_rate,
        max_stake_amount: config.max_stake_amount,
        emergency_paused: config.emergency_paused,
    }
}

// Função para obter informações sobre a coleção de NFTs
pub fn get_collection_info(
    collection_metadata: Account<NFTMetadata>,
    nft_counter: Account<NftCounter>,
) -> (String, String, String, u64) {
    (
        collection_metadata.name.clone(),
        collection_metadata.symbol.clone(),
        collection_metadata.uri.clone(),
        nft_counter.count,
    )
} 