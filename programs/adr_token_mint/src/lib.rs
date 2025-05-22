use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{AssociatedToken}, 
    token::{Mint, Token, TokenAccount, mint_to, MintTo, approve, Approve, burn, Burn, transfer, Transfer},
};

declare_id!("9cDdb8o8hnfZjvKffc9pzGhvcEG7dVjg9yXHMDuL975v");

// Definir evento para registrar informações de queima de tokens
#[event]
pub struct TokenBurnEvent {
    pub payer: Pubkey,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub nft_mint: Pubkey,
    pub timestamp: i64,
}

// Enumeração para os diferentes períodos de staking
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum StakingPeriod {
    Minutes1 = 1,    // 1 minuto
    Minutes2 = 2,    // 2 minutos
    Minutes5 = 5,    // 5 minutos
    Minutes10 = 10,  // 10 minutos
    Minutes30 = 30,  // 30 minutos
}

impl StakingPeriod {
    // Retorna a duração em segundos
    pub fn duration_in_seconds(&self) -> i64 {
        (*self as i64)
            .checked_mul(60).expect("Overflow em duration_in_seconds") // minutos * segundos
    }
    
    // Retorna o multiplicador de recompensa
    pub fn reward_multiplier(&self) -> u64 {
        match self {
            StakingPeriod::Minutes1 => 105,  // 5% de bônus (105%)
            StakingPeriod::Minutes2 => 110,  // 10% de bônus
            StakingPeriod::Minutes5 => 120,  // 20% de bônus
            StakingPeriod::Minutes10 => 140, // 40% de bônus
            StakingPeriod::Minutes30 => 150, // 50% de bônus
        }
    }
}

// Eventos para monitoramento
#[event]
pub struct StakingEvent {
    pub staker: Pubkey,
    pub amount: u64,
    pub period: StakingPeriod,
    pub start_time: i64,
    pub unlock_time: i64,
    pub stake_account: Pubkey,
}

#[event]
pub struct UnstakingEvent {
    pub staker: Pubkey,
    pub stake_account: Pubkey,
    pub original_amount: u64,
    pub reward_amount: u64,
    pub total_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct ConfigUpdateEvent {
    pub admin: Pubkey,
    pub field: String,
    pub old_value: String,
    pub new_value: String,
    pub timestamp: i64,
}

#[event]
pub struct EmergencyPauseEvent {
    pub admin: Pubkey,
    pub paused: bool,
    pub reason: String,
    pub timestamp: i64,
}

// Adicionar nova estrutura para o contador
#[account]
pub struct NftCounter {
    pub count: u64,  // Contador global de NFTs
}

#[account]
pub struct ConfigAccount {
    pub payment_token_mint: Pubkey,
    pub admin: Pubkey,
    pub staking_enabled: bool,
    pub staking_reward_rate: u64, // Base em pontos percentuais (10000 = 100%)
    pub max_stake_amount: u64,    // Valor máximo que pode ser colocado em stake
    pub emergency_paused: bool,   // Flag para pausar o contrato em caso de emergência
}

#[program]
pub mod adr_token_mint {
    use super::*;

    // Inicializa a coleção de NFTs
    pub fn initialize_collection(
        ctx: Context<InitializeCollection>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        // Validar que os inputs não estão vazios
        require!(!name.is_empty(), ErrorCode::InvalidInput);
        require!(!symbol.is_empty(), ErrorCode::InvalidInput);
        require!(!uri.is_empty(), ErrorCode::InvalidInput);
        
        msg!("Inicializando a coleção de NFTs: {}, {}, {}", name, symbol, uri);
        
        // Armazenar informações na conta de metadados
        let metadata = &mut ctx.accounts.collection_metadata;
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.uri = uri;
        metadata.authority = ctx.accounts.payer.key();
        
        // Configurar a conta do token
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.payer.key();
        config.payment_token_mint = Pubkey::default();
        config.staking_enabled = false;
        config.staking_reward_rate = 0; // taxa base de recompensa (será configurada depois)
        config.max_stake_amount = 1_000_000 * 10u64.pow(9); // Limite máximo de stake: 1 milhão de tokens
        config.emergency_paused = false; // Inicialmente não pausado
        
        // Inicializar o contador
        let counter = &mut ctx.accounts.nft_counter;
        counter.count = 0;
        
        msg!("Coleção inicializada e contador de NFTs zerado");
        
        Ok(())
    }


    // Função atualizada de mint
    pub fn mint_nft_with_payment(
        ctx: Context<MintNFTWithPayment>,
        name: String,
        symbol: String,
        uri: String,
        amount: u64,
    ) -> Result<()> {
        // Verificar se o sistema está pausado
        require!(!ctx.accounts.config.emergency_paused, ErrorCode::SystemPaused);
        
        // Validar inputs
        require!(!name.is_empty(), ErrorCode::InvalidInput);
        require!(!symbol.is_empty(), ErrorCode::InvalidInput);
        require!(!uri.is_empty(), ErrorCode::InvalidInput);
        
        // Verificar saldo do usuário
        require!(
            ctx.accounts.payer_payment_token_account.amount >= amount,
            ErrorCode::InsufficientFunds
        );
        
        // Queimar os tokens como pagamento
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.payment_token_mint.to_account_info(),
                from: ctx.accounts.payer_payment_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        
        burn(burn_ctx, amount)?;
        
        // Emitir evento com informações da queima
        let clock = Clock::get()?;
        emit!(TokenBurnEvent {
            payer: ctx.accounts.payer.key(),
            token_mint: ctx.accounts.payment_token_mint.key(),
            amount,
            nft_mint: ctx.accounts.nft_mint.key(),
            timestamp: clock.unix_timestamp,
        });
        
        // Criar o NFT
        let metadata = &mut ctx.accounts.nft_metadata;
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.uri = uri;
        metadata.authority = ctx.accounts.payer.key();
        metadata.collection = Some(ctx.accounts.collection_metadata.key());
        
        // Mintar o NFT
        let cpi_accounts = MintTo {
            mint: ctx.accounts.nft_mint.to_account_info(),
            to: ctx.accounts.nft_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        mint_to(cpi_ctx, 1)?;
        
        // Incrementar o contador
        let counter = &mut ctx.accounts.nft_counter;
        counter.count = counter.count.checked_add(1).ok_or(ErrorCode::MathOverflow)?;
        
        Ok(())
    }

    // Aprovar uma carteira para gastar tokens
    pub fn approve_delegate(
        ctx: Context<ApproveDelegate>,
        amount: u64,
    ) -> Result<()> {
        msg!("Aprovando delegado para gastar tokens: {}", amount);

        let cpi_accounts = Approve {
            to: ctx.accounts.token_account.to_account_info(),
            delegate: ctx.accounts.delegate.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        approve(cpi_ctx, amount)?;

        Ok(())
    }

    // Função para configurar o token após seu lançamento
    pub fn set_payment_token(
        ctx: Context<SetPaymentToken>,
        payment_token_mint: Pubkey,
    ) -> Result<()> {
        // Verificar se o chamador é o administrador
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.config.admin,
            ErrorCode::Unauthorized
        );
        
        ctx.accounts.config.payment_token_mint = payment_token_mint;
        msg!("Token de pagamento definido: {}", payment_token_mint);
        
        Ok(())
    }

    // Ativar o sistema de staking e definir a taxa de recompensa
    pub fn configure_staking(
        ctx: Context<ConfigureStaking>,
        enabled: bool,
        reward_rate: u64,
    ) -> Result<()> {
        // Verificar se o chamador é o administrador
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.config.admin,
            ErrorCode::Unauthorized
        );
        
        let old_enabled = ctx.accounts.config.staking_enabled;
        let old_rate = ctx.accounts.config.staking_reward_rate;
        
        ctx.accounts.config.staking_enabled = enabled;
        ctx.accounts.config.staking_reward_rate = reward_rate;
        
        // Emitir eventos de atualização de configuração
        emit!(ConfigUpdateEvent {
            admin: ctx.accounts.admin.key(),
            field: "staking_enabled".to_string(),
            old_value: old_enabled.to_string(),
            new_value: enabled.to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        emit!(ConfigUpdateEvent {
            admin: ctx.accounts.admin.key(),
            field: "staking_reward_rate".to_string(),
            old_value: old_rate.to_string(),
            new_value: reward_rate.to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Staking configurado: enabled={}, reward_rate={}", enabled, reward_rate);
        
        Ok(())
    }
    
    // Adicionar função para listar stakes de um usuário
    pub fn get_user_stakes(ctx: Context<GetUserStakes>) -> Result<Vec<StakeInfo>> {
        // Retornar informações dos stakes do usuário
        let _user = ctx.accounts.user.key(); // Prefixado com _ para indicar que é intencionalmente não utilizado
        let stakes = Vec::new(); // Removido o mut pois não é necessário
        
        // Aqui precisaríamos implementar uma forma de buscar todas as contas de stake
        // do usuário. Uma opção é usar um mapa ou lista na conta de configuração.
        
        Ok(stakes)
    }

    // Função para obter o stake atual do usuário
    pub fn get_current_stake(ctx: Context<GetCurrentStake>) -> Result<StakeInfo> {
        let stake_account = &ctx.accounts.stake_account;
        
        Ok(StakeInfo {
            amount: stake_account.amount,
            start_time: stake_account.start_time,
            unlock_time: stake_account.unlock_time,
            period: stake_account.period,
            claimed: stake_account.claimed,
        })
    }

    // Modificar a função de stake para atualizar o stake existente
    pub fn stake_tokens(
        ctx: Context<StakeTokens>,
        amount: u64,
        period: StakingPeriod,
    ) -> Result<()> {
        require!(!ctx.accounts.config.emergency_paused, ErrorCode::SystemPaused);
        require!(ctx.accounts.config.staking_enabled, ErrorCode::StakingNotEnabled);
        require!(amount > 0, ErrorCode::InvalidStakeAmount);
        require!(amount <= ctx.accounts.config.max_stake_amount, ErrorCode::StakeAmountTooLarge);
    
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let unlock_time = current_time
            .checked_add(period.duration_in_seconds())
            .ok_or(ErrorCode::MathOverflow)?;
    
        let stake_account = &mut ctx.accounts.stake_account;
    
        // Seeds para o PDA
        let signer_seeds: &[&[u8]] = &[b"stake_authority", &[ctx.bumps.stake_authority]];
    
        if stake_account.amount > 0 && !stake_account.claimed {
            let stake_authority_seed: &[u8] = b"stake_authority";
            let bump_seed: &[u8] = &[ctx.bumps.stake_authority];
            let signer_seeds: [&[u8]; 2] = [stake_authority_seed, bump_seed];
            let signer_seeds_slice: &[&[u8]] = &signer_seeds;
            let signer_seeds_nested: &[&[&[u8]]] = &[signer_seeds_slice];
            
            let return_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.stake_token_account.to_account_info(),
                    to: ctx.accounts.staker_token_account.to_account_info(),
                    authority: ctx.accounts.stake_authority.to_account_info(),
                },
                signer_seeds_nested,
            );
            transfer(return_ctx, stake_account.amount)?;
    
            let new_amount = if stake_account.period == period {
                stake_account.amount.checked_add(amount).ok_or(ErrorCode::MathOverflow)?
            } else {
                amount
            };
    
            // Transfere novos tokens do staker
            let stake_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staker_token_account.to_account_info(),
                    to: ctx.accounts.stake_token_account.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            );
            transfer(stake_ctx, new_amount)?;
    
            // Atualiza stake
            let old_amount = stake_account.amount;
            let old_period = stake_account.period;
            stake_account.amount = new_amount;
            stake_account.period = period;
            stake_account.start_time = current_time;
            stake_account.unlock_time = unlock_time;
    
            if old_period == period {
                emit!(StakeAddedEvent {
                    staker: ctx.accounts.staker.key(),
                    additional_amount: amount,
                    total_amount: new_amount,
                    new_unlock_time: unlock_time,
                    timestamp: current_time,
                });
            } else {
                emit!(StakeUpdatedEvent {
                    staker: ctx.accounts.staker.key(),
                    old_amount,
                    new_amount,
                    old_period,
                    new_period: period,
                    start_time: current_time,
                    unlock_time,
                    timestamp: current_time,
                });
            }
        } else {
            // Primeiro stake ou após claim
            let stake_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.staker_token_account.to_account_info(),
                    to: ctx.accounts.stake_token_account.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            );
            transfer(stake_ctx, amount)?;
    
            stake_account.owner = ctx.accounts.staker.key();
            stake_account.amount = amount;
            stake_account.start_time = current_time;
            stake_account.unlock_time = unlock_time;
            stake_account.period = period;
            stake_account.claimed = false;
    
            emit!(StakingEvent {
                staker: ctx.accounts.staker.key(),
                amount,
                period,
                start_time: current_time,
                unlock_time,
                stake_account: stake_account.key(),
            });
        }
    
        Ok(())
    }    
    
    // Resgatar tokens do staking e receber recompensas
    pub fn unstake_tokens(ctx: Context<UnstakeTokens>) -> Result<()> {
        // Verificar se o sistema está pausado para emergências
        require!(!ctx.accounts.config.emergency_paused, ErrorCode::SystemPaused);
        
        // Verificar se o período de staking terminou
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        
        require!(
            current_time >= ctx.accounts.stake_account.unlock_time,
            ErrorCode::StakingPeriodNotCompleted
        );
        
        require!(
            !ctx.accounts.stake_account.claimed,
            ErrorCode::RewardsAlreadyClaimed
        );
        
        // Calcular recompensas com verificações de overflow
        let staked_amount = ctx.accounts.stake_account.amount;
        let period = ctx.accounts.stake_account.period;
        let base_rate = ctx.accounts.config.staking_reward_rate;
        let multiplier = period.reward_multiplier();
        
        // Cálculo: staked_amount * (base_rate / 10000) * (multiplier / 100)
        let reward_amount = staked_amount
            .checked_mul(base_rate).ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000).ok_or(ErrorCode::MathOverflow)?
            .checked_mul(multiplier).ok_or(ErrorCode::MathOverflow)?
            .checked_div(100).ok_or(ErrorCode::MathOverflow)?;
        
        // Transferir os tokens originais de volta para o staker
        let stake_authority_seed = b"stake_authority";
        let authority_seeds = &[
            stake_authority_seed.as_ref(),
            &[ctx.bumps.stake_authority],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.stake_token_account.to_account_info(),
                to: ctx.accounts.staker_token_account.to_account_info(),
                authority: ctx.accounts.stake_authority.to_account_info(),
            },
            signer_seeds,
        );
        transfer(transfer_ctx, staked_amount)?;
        
        // Se houver recompensas, mintar para o staker
        if reward_amount > 0 {
            // Criar seeds para o signer
            let mint_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.reward_token_mint.to_account_info(),
                    to: ctx.accounts.staker_token_account.to_account_info(),
                    authority: ctx.accounts.stake_authority.to_account_info(),
                },
                signer_seeds,
            );
            mint_to(mint_ctx, reward_amount)?;
        }
        
        // Marcar como reivindicado
        ctx.accounts.stake_account.claimed = true;
        
        // Emitir evento de unstaking
        emit!(UnstakingEvent {
            staker: ctx.accounts.staker.key(),
            stake_account: ctx.accounts.stake_account.key(),
            original_amount: staked_amount,
            reward_amount,
            total_amount: staked_amount.checked_add(reward_amount).ok_or(ErrorCode::MathOverflow)?,
            timestamp: clock.unix_timestamp,
        });
        
        msg!("Unstake concluído: {} tokens originais + {} tokens de recompensa", 
            staked_amount, reward_amount);
        
        Ok(())
    }

    // Adicionar funcionalidade de pausa de emergência
    pub fn set_emergency_pause(
        ctx: Context<EmergencyPause>,
        paused: bool,
        reason: String,
    ) -> Result<()> {
        // Apenas o admin pode pausar/despausar o contrato
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.config.admin,
            ErrorCode::Unauthorized
        );
        
        ctx.accounts.config.emergency_paused = paused;
        
        // Emitir evento de pausa
        emit!(EmergencyPauseEvent {
            admin: ctx.accounts.admin.key(),
            paused,
            reason: reason.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Status de emergência atualizado: paused={}, reason={}", paused, reason);
        
        Ok(())
    }
    
    // Adicionar funcionalidade para atualizar o admin
    pub fn update_admin(
        ctx: Context<UpdateAdmin>,
        new_admin: Pubkey
    ) -> Result<()> {
        // Verificar que o endereço do novo admin não é vazio
        require!(new_admin != Pubkey::default(), ErrorCode::InvalidInput);
        
        // Apenas o admin atual pode transferir a propriedade
        require_keys_eq!(
            ctx.accounts.current_admin.key(),
            ctx.accounts.config.admin,
            ErrorCode::Unauthorized
        );
        
        let old_admin = ctx.accounts.config.admin;
        ctx.accounts.config.admin = new_admin;
        
        // Emitir evento de atualização de configuração
        emit!(ConfigUpdateEvent {
            admin: ctx.accounts.current_admin.key(),
            field: "admin".to_string(),
            old_value: old_admin.to_string(),
            new_value: new_admin.to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Admin atualizado para: {}", new_admin);
        
        Ok(())
    }
    
    // Adicionar funcionalidade para atualizar o limite máximo de stake
    pub fn update_max_stake_amount(
        ctx: Context<UpdateStakingConfig>,
        max_amount: u64
    ) -> Result<()> {
        // Apenas o admin pode atualizar os limites
        require_keys_eq!(
            ctx.accounts.admin.key(),
            ctx.accounts.config.admin,
            ErrorCode::Unauthorized
        );
        
        let old_amount = ctx.accounts.config.max_stake_amount;
        ctx.accounts.config.max_stake_amount = max_amount;
        
        // Emitir evento de atualização de configuração
        emit!(ConfigUpdateEvent {
            admin: ctx.accounts.admin.key(),
            field: "max_stake_amount".to_string(),
            old_value: old_amount.to_string(),
            new_value: max_amount.to_string(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!("Valor máximo de stake atualizado para: {}", max_amount);
        
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCollection<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
    )]
    pub collection_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 4 + 50 + 4 + 10 + 4 + 200, // discriminator + pubkey + name + symbol + uri
    )]
    pub collection_metadata: Account<'info, NFTMetadata>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = collection_mint,
        associated_token::authority = payer,
    )]
    pub collection_token_account: Account<'info, TokenAccount>,

    // Conta para armazenar a configuração
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 32 + 1 + 8 + 8 + 1, // discriminator + pubkey (payment_token_mint) + pubkey (admin) + staking_enabled + staking_reward_rate + max_stake_amount + emergency_paused
    )]
    pub config: Account<'info, ConfigAccount>,

    // Adicionar conta do contador
    #[account(
        init,
        payer = payer,
        space = 8 + 8, // discriminator + u64
        seeds = [b"nft_counter"],
        bump,
    )]
    pub nft_counter: Account<'info, NftCounter>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintNFT<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
    )]
    pub nft_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 4 + 50 + 4 + 10 + 4 + 200 + 1 + 32, // discriminator + pubkey + name + symbol + uri + Option<Pubkey>
    )]
    pub nft_metadata: Account<'info, NFTMetadata>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = nft_mint,
        associated_token::authority = payer,
    )]
    pub nft_token_account: Account<'info, TokenAccount>,

    // Referência à coleção
    pub collection_metadata: Account<'info, NFTMetadata>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ApproveDelegate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        constraint = token_account.owner == owner.key() @ ErrorCode::Unauthorized,
    )]
    pub token_account: Account<'info, TokenAccount>,

    /// CHECK: Esta é a carteira delegada
    pub delegate: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPaymentToken<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut)]
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct MintNFTWithPayment<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"nft_counter"],
        bump,
    )]
    pub nft_counter: Account<'info, NftCounter>,
    
    #[account(
        init,
        payer = payer,
        mint::decimals = 0,
        mint::authority = payer,
        seeds = [
            b"nft_mint",
            collection_metadata.key().as_ref(),
            nft_counter.count.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub nft_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = payer,
        space = 8 + 32 + 4 + 50 + 4 + 10 + 4 + 200 + 1 + 32,
        seeds = [
            b"nft_metadata",
            nft_mint.key().as_ref(),
        ],
        bump,
    )]
    pub nft_metadata: Account<'info, NFTMetadata>,
    
    #[account(
        init,
        payer = payer,
        associated_token::mint = nft_mint,
        associated_token::authority = payer,
    )]
    pub nft_token_account: Account<'info, TokenAccount>,
    
    pub collection_metadata: Account<'info, NFTMetadata>,
    
    #[account(mut)]
    pub payment_token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = payment_token_mint,
        associated_token::authority = payer,
    )]
    pub payer_payment_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = config.payment_token_mint != Pubkey::default() 
            @ ErrorCode::PaymentTokenNotConfigured,
    )]
    pub config: Account<'info, ConfigAccount>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ConfigureStaking<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
#[instruction(amount: u64, period: StakingPeriod)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    
    // Token a ser usado para staking (o mesmo token de pagamento)
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staker,
        constraint = staker_token_account.amount >= amount @ ErrorCode::InsufficientFunds,
    )]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    // Conta que vai guardar os tokens em stake
    #[account(
        init_if_needed,
        payer = staker,
        space = 8 + 32 + 8 + 8 + 8 + 4 + 1,
        seeds = [b"stake_account", staker.key().as_ref(), token_mint.key().as_ref()],
        bump
    )]
    pub stake_account: Account<'info, StakeAccount>,

    // Conta que vai armazenar os tokens em stake
    #[account(
        init_if_needed,
        payer = staker,
        associated_token::mint = token_mint,
        associated_token::authority = stake_authority,
    )]
    pub stake_token_account: Account<'info, TokenAccount>,
    
    // Autoridade PDA para controlar os tokens em stake
    #[account(
        seeds = [b"stake_authority"],
        bump,
    )]
    /// CHECK: Este é um PDA usado como autoridade
    pub stake_authority: UncheckedAccount<'info>,
    
    // Configuração do token
    pub config: Account<'info, ConfigAccount>,
    
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct UnstakeTokens<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,
    
    // Token a ser usado para staking (o mesmo token de pagamento)
    pub token_mint: Account<'info, Mint>,
    
    // Token mint para recompensas (pode ser o mesmo ou outro token)
    #[account(mut)]
    pub reward_token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = staker,
    )]
    pub staker_token_account: Account<'info, TokenAccount>,
    
    // Conta que guarda os tokens em stake
    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = stake_authority,
    )]
    pub stake_token_account: Account<'info, TokenAccount>,
    
    // Autoridade PDA para controlar os tokens em stake
    #[account(
        seeds = [b"stake_authority"],
        bump,
    )]
    /// CHECK: Este é um PDA usado como autoridade
    pub stake_authority: UncheckedAccount<'info>,
    
    // Conta que rastreia informações do staking
    #[account(
        mut,
        constraint = stake_account.owner == staker.key() @ ErrorCode::Unauthorized,
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
    // Configuração do token
    pub config: Account<'info, ConfigAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct NFTMetadata {
    pub authority: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub collection: Option<Pubkey>,
}

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,           
    pub amount: u64,             
    pub start_time: i64,        
    pub unlock_time: i64,      
    pub period: StakingPeriod,   
    pub claimed: bool,         
}

#[derive(Accounts)]
pub struct EmergencyPause<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct UpdateAdmin<'info> {
    #[account(mut)]
    pub current_admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.admin == current_admin.key() @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct UpdateStakingConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        constraint = config.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct GetUserStakes<'info> {
    pub user: Signer<'info>,
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct GetCurrentStake<'info> {
    pub user: Signer<'info>,
    pub stake_account: Account<'info, StakeAccount>,
}

#[event]
pub struct StakeUpdatedEvent {
    pub staker: Pubkey,
    pub old_amount: u64,
    pub new_amount: u64,
    pub old_period: StakingPeriod,
    pub new_period: StakingPeriod,
    pub start_time: i64,
    pub unlock_time: i64,
    pub timestamp: i64,
}

#[event]
pub struct StakeAddedEvent {
    pub staker: Pubkey,
    pub additional_amount: u64,
    pub total_amount: u64,
    pub new_unlock_time: i64,
    pub timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct StakeInfo {
    pub amount: u64,
    pub start_time: i64,
    pub unlock_time: i64,
    pub period: StakingPeriod,
    pub claimed: bool,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Você não está autorizado a realizar esta ação")]
    Unauthorized,
    
    #[msg("Token de pagamento inválido")]
    InvalidPaymentToken,
    
    #[msg("Valor de pagamento inválido")]
    InvalidPaymentAmount,
    
    #[msg("Token de pagamento não configurado")]
    PaymentTokenNotConfigured,
    
    #[msg("Staking não está habilitado")]
    StakingNotEnabled,
    
    #[msg("Valor de stake inválido")]
    InvalidStakeAmount,
    
    #[msg("Fundos insuficientes")]
    InsufficientFunds,
    
    #[msg("Período de staking não completado")]
    StakingPeriodNotCompleted,
    
    #[msg("Recompensas já foram reivindicadas")]
    RewardsAlreadyClaimed,
    
    #[msg("Pagamento não aprovado. Use approve_delegate primeiro")]
    PaymentNotApproved,
    
    #[msg("O sistema está pausado para emergência")]
    SystemPaused,
    
    #[msg("Valor de entrada inválido")]
    InvalidInput,
    
    #[msg("Erro de overflow matemático")]
    MathOverflow,
    
    #[msg("Valor de stake excede o limite máximo permitido")]
    StakeAmountTooLarge,
    
    #[msg("Este stake já foi reivindicado")]
    StakeAlreadyClaimed,
}

// Novas estruturas de contexto para funções view

/*
#[derive(Accounts)]
pub struct GetStakeSummaryView<'info> {
    pub staker: Signer<'info>,
    pub token_mint: Account<'info, Mint>,
    pub stake_account: Account<'info, StakeAccount>,
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct GetConfigSummaryView<'info> {
    pub config: Account<'info, ConfigAccount>,
}

#[derive(Accounts)]
pub struct GetCollectionInfoView<'info> {
    pub collection_metadata: Account<'info, NFTMetadata>,
    #[account(
        seeds = [b"nft_counter"],
        bump,
    )]
    pub nft_counter: Account<'info, NftCounter>,
}

#[derive(Accounts)]
pub struct CalculateRewardView<'info> {
    pub config: Account<'info, ConfigAccount>,
}
*/
