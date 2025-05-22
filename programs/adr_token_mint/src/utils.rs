use anchor_lang::prelude::*;
use crate::NftCounter;

// Constantes para seeds de PDAs
pub const NFT_COUNTER_SEED: &[u8] = b"nft_counter";
pub const NFT_MINT_SEED: &[u8] = b"nft_mint";
pub const NFT_METADATA_SEED: &[u8] = b"nft_metadata";
pub const STAKE_ACCOUNT_SEED: &[u8] = b"stake_account";
pub const STAKE_AUTHORITY_SEED: &[u8] = b"stake_authority";

// Funções para encontrar PDAs
pub fn find_nft_counter_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[NFT_COUNTER_SEED], &crate::ID)
}

pub fn find_nft_mint_pda(collection: &Pubkey, count: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            NFT_MINT_SEED,
            collection.as_ref(),
            count.to_le_bytes().as_ref(),
        ],
        &crate::ID,
    )
}

pub fn find_nft_metadata_pda(mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            NFT_METADATA_SEED,
            mint.as_ref(),
        ],
        &crate::ID,
    )
}

pub fn find_stake_account_pda(staker: &Pubkey, token_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            STAKE_ACCOUNT_SEED,
            staker.as_ref(),
            token_mint.as_ref(),
        ],
        &crate::ID,
    )
}

pub fn find_stake_authority_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[STAKE_AUTHORITY_SEED], &crate::ID)
}

// Funções de utilidade para o frontend
pub fn calculate_reward(
    staked_amount: u64,
    base_rate: u64,
    multiplier: u64,
) -> Result<u64> {
    // Cálculo: staked_amount * (base_rate / 10000) * (multiplier / 100)
    let reward_amount = staked_amount
        .checked_mul(base_rate).ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(10000).ok_or(ProgramError::ArithmeticOverflow)?
        .checked_mul(multiplier).ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(100).ok_or(ProgramError::ArithmeticOverflow)?;
    
    Ok(reward_amount)
} 