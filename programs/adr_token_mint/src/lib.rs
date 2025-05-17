use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{AssociatedToken}, 
    token::{Mint, Token, TokenAccount, mint_to, MintTo, approve, Approve, burn, Burn, transfer, Transfer},
};

declare_id!("GKf6NkHokaNXcov4kgPqftFrd9QfJMcgRwaCVSWc5yTz");

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
    Days7 = 7,
    Days14 = 14,
    Days30 = 30, 
    Days90 = 90,
    Days180 = 180,
}

impl StakingPeriod {
    // Retorna a duração em segundos
    pub fn duration_in_seconds(&self) -> i64 {
        (*self as i64)
            .checked_mul(24).expect("Overflow em duration_in_seconds")
            .checked_mul(60).expect("Overflow em duration_in_seconds")
            .checked_mul(60).expect("Overflow em duration_in_seconds") // dias * horas * minutos * segundos
    }
    
    // Retorna o multiplicador de recompensa
    pub fn reward_multiplier(&self) -> u64 {
        match self {
            StakingPeriod::Days7 => 105, // 5% de bônus (105%)
            StakingPeriod::Days14 => 110, // 10% de bônus
            StakingPeriod::Days30 => 120, // 20% de bônus
            StakingPeriod::Days90 => 140, // 40% de bônus
            StakingPeriod::Days180 => 150, // 50% de bônus (2x)
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
        
        Ok(())
    }

    // Mintar um novo NFT na coleção
    pub fn mint_nft(
        ctx: Context<MintNFT>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        msg!("Mintando um novo NFT: {}, {}, {}", name, symbol, uri);

        // Armazenar informações na conta de metadados do NFT
        let metadata = &mut ctx.accounts.nft_metadata;
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.uri = uri;
        metadata.authority = ctx.accounts.payer.key();
        metadata.collection = Some(ctx.accounts.collection_metadata.key());

        // Mintar 1 token para o NFT
        let cpi_accounts = MintTo {
            mint: ctx.accounts.nft_mint.to_account_info(),
            to: ctx.accounts.nft_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        mint_to(cpi_ctx, 1)?;

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

    // Mintar um novo NFT com pagamento (queima de tokens)
    pub fn mint_nft_with_payment(
        ctx: Context<MintNFTWithPayment>,
        name: String,
        symbol: String,
        uri: String,
        payment_amount: u64,
    ) -> Result<()> {
        // Verificar se o sistema está pausado para emergências
        require!(!ctx.accounts.config.emergency_paused, ErrorCode::SystemPaused);
        
        // Validar inputs não vazios
        require!(!name.is_empty(), ErrorCode::InvalidInput);
        require!(!symbol.is_empty(), ErrorCode::InvalidInput);
        require!(!uri.is_empty(), ErrorCode::InvalidInput);
        
        msg!("Mintando NFT com pagamento: {}, {}, {}, pagamento: {} tokens", 
            name, symbol, uri, payment_amount);

        // Verificar se o token de pagamento configurado é válido
        let payment_token_mint = ctx.accounts.config.payment_token_mint;
        require_keys_eq!(
            payment_token_mint,
            ctx.accounts.payment_token_mint.key(),
            ErrorCode::InvalidPaymentToken
        );

        // Verificar se o pagamento é suficiente
        require!(
            payment_amount > 0,
            ErrorCode::InvalidPaymentAmount
        );

        // Verificar se o usuário tem saldo suficiente para o pagamento
        require!(
            ctx.accounts.payer_payment_token_account.amount >= payment_amount,
            ErrorCode::InsufficientFunds
        );
        
        msg!("Queimando tokens do pagador: {}, valor: {}", 
            ctx.accounts.payer_payment_token_account.key(),
            payment_amount);

        // Queimar os tokens como pagamento
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.payment_token_mint.to_account_info(),
                from: ctx.accounts.payer_payment_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        
        msg!("Iniciando operação de queima");
        let burn_result = burn(burn_ctx, payment_amount);
        match &burn_result {
            Ok(_) => msg!("Queima bem-sucedida"),
            Err(e) => msg!("Erro na queima: {:?}", e),
        }
        burn_result?;
        
        // Emitir evento com informações da queima
        let clock = Clock::get()?;
        emit!(TokenBurnEvent {
            payer: ctx.accounts.payer.key(),
            token_mint: ctx.accounts.payment_token_mint.key(),
            amount: payment_amount,
            nft_mint: ctx.accounts.nft_mint.key(),
            timestamp: clock.unix_timestamp,
        });

        // Armazenar informações na conta de metadados do NFT
        let metadata = &mut ctx.accounts.nft_metadata;
        metadata.name = name;
        metadata.symbol = symbol;
        metadata.uri = uri;
        metadata.authority = ctx.accounts.payer.key();
        metadata.collection = Some(ctx.accounts.collection_metadata.key());

        // Mintar 1 token para o NFT
        let cpi_accounts = MintTo {
            mint: ctx.accounts.nft_mint.to_account_info(),
            to: ctx.accounts.nft_token_account.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        mint_to(cpi_ctx, 1)?;

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
    
    // Fazer stake de tokens
    pub fn stake_tokens(
        ctx: Context<StakeTokens>,
        amount: u64,
        period: StakingPeriod,
    ) -> Result<()> {
        // Verificar se o sistema está pausado para emergências
        require!(!ctx.accounts.config.emergency_paused, ErrorCode::SystemPaused);
        
        // Verificar se o staking está habilitado
        require!(
            ctx.accounts.config.staking_enabled,
            ErrorCode::StakingNotEnabled
        );
        
        // Verificar se o valor é válido
        require!(
            amount > 0,
            ErrorCode::InvalidStakeAmount
        );
        
        // Verificar se o valor não excede o limite máximo
        require!(
            amount <= ctx.accounts.config.max_stake_amount,
            ErrorCode::StakeAmountTooLarge
        );
        
        // Calcular quando o staking termina
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        let unlock_time = current_time.checked_add(period.duration_in_seconds())
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Transferir tokens para a conta de stake
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.staker_token_account.to_account_info(),
                to: ctx.accounts.stake_token_account.to_account_info(),
                authority: ctx.accounts.staker.to_account_info(),
            },
        );
        transfer(transfer_ctx, amount)?;
        
        // Atualizar os dados da conta de staking
        let stake_account = &mut ctx.accounts.stake_account;
        stake_account.owner = ctx.accounts.staker.key();
        stake_account.amount = amount;
        stake_account.start_time = current_time;
        stake_account.unlock_time = unlock_time;
        stake_account.period = period;
        stake_account.claimed = false;
        
        // Emitir evento de staking
        emit!(StakingEvent {
            staker: ctx.accounts.staker.key(),
            amount,
            period,
            start_time: current_time,
            unlock_time,
            stake_account: stake_account.key(),
        });
        
        msg!("Tokens em stake: {} tokens por {} dias, desbloqueio em: {}", 
            amount, period as u8, unlock_time);
        
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
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.stake_token_account.to_account_info(),
                to: ctx.accounts.staker_token_account.to_account_info(),
                authority: ctx.accounts.stake_authority.to_account_info(),
            },
        );
        transfer(transfer_ctx, staked_amount)?;
        
        // Se houver recompensas, mintar para o staker
        if reward_amount > 0 {
            // Criar seeds para o signer
            let stake_authority_seed = b"stake_authority";
            let authority_seeds = &[
                stake_authority_seed.as_ref(),
                &[ctx.bumps.stake_authority],
            ];
            let signer_seeds = &[&authority_seeds[..]];

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

    // Conta do token de pagamento (mint)
    #[account(mut)]
    pub payment_token_mint: Account<'info, Mint>,

    // Conta do token do pagador
    #[account(
        mut,
        associated_token::mint = payment_token_mint,
        associated_token::authority = payer,
    )]
    pub payer_payment_token_account: Account<'info, TokenAccount>,

    // Configuração da coleção
    #[account(
        mut,
        constraint = config.payment_token_mint != Pubkey::default() @ ErrorCode::PaymentTokenNotConfigured,
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
    
    // Conta para rastrear informações do staking
    #[account(
        init,
        payer = staker,
        space = 8 + 32 + 8 + 8 + 8 + 4 + 1, // discriminator + owner + amount + start_time + unlock_time + period + claimed
    )]
    pub stake_account: Account<'info, StakeAccount>,
    
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
pub struct ConfigAccount {
    pub payment_token_mint: Pubkey,
    pub admin: Pubkey,
    pub staking_enabled: bool,
    pub staking_reward_rate: u64, // Base em pontos percentuais (10000 = 100%)
    pub max_stake_amount: u64,    // Valor máximo que pode ser colocado em stake
    pub emergency_paused: bool,   // Flag para pausar o contrato em caso de emergência
}

#[account]
pub struct StakeAccount {
    pub owner: Pubkey,           // Dono dos tokens em stake
    pub amount: u64,             // Quantidade de tokens em stake
    pub start_time: i64,         // Timestamp de início do staking
    pub unlock_time: i64,        // Timestamp de quando os tokens podem ser retirados
    pub period: StakingPeriod,   // Período de staking selecionado
    pub claimed: bool,           // Se as recompensas já foram reivindicadas
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
}
