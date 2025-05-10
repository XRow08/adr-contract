use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{AssociatedToken}, 
    token::{Mint, Token, TokenAccount, mint_to, MintTo, approve, Approve, burn, Burn, transfer, Transfer},
};

declare_id!("9cDdb8o8hnfZjvKffc9pzGhvcEG7dVjg9yXHMDuL975v");

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
        config.payment_token_mint = Pubkey::default(); // Valor padrão até ser definido
        
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

        // Queimar os tokens de pagamento
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.payment_token_mint.to_account_info(),
                from: ctx.accounts.payer_payment_token_account.to_account_info(),
                authority: ctx.accounts.payer.to_account_info(),
            },
        );
        burn(burn_ctx, payment_amount)?;

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
        space = 8 + 32 + 32, // discriminator + pubkey (payment_token_mint) + pubkey (admin)
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

    // Conta do token de pagamento
    pub payment_token_mint: Account<'info, Mint>,

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
}
