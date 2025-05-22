import { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  Keypair
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress
} from '@solana/spl-token';
import { Program, web3, BN, utils } from '@project-serum/anchor';
import { AdrTokenMint } from '../types/adr_token_mint';

// ID do programa (substitua pelo seu ID real)
export const PROGRAM_ID = new PublicKey('9cDdb8o8hnfZjvKffc9pzGhvcEG7dVjg9yXHMDuL975v');

// Seeds para PDAs
export const NFT_COUNTER_SEED = Buffer.from('nft_counter');
export const NFT_MINT_SEED = Buffer.from('nft_mint');
export const NFT_METADATA_SEED = Buffer.from('nft_metadata');
export const STAKE_ACCOUNT_SEED = Buffer.from('stake_account');
export const STAKE_AUTHORITY_SEED = Buffer.from('stake_authority');

// Enumeração para períodos de staking
export enum StakingPeriod {
  Minutes1 = 1,
  Minutes2 = 2,
  Minutes5 = 5,
  Minutes10 = 10,
  Minutes30 = 30
}

// Estrutura de resumo de staking
export interface StakingSummary {
  isStaking: boolean;
  amount: BN;
  startTime: BN;
  unlockTime: BN;
  period: StakingPeriod;
  claimed: boolean;
  canUnstake: boolean;
  estimatedReward: BN;
  timeRemaining: BN;
}

// Estrutura de resumo de configuração
export interface ConfigSummary {
  paymentTokenMint: PublicKey;
  admin: PublicKey;
  stakingEnabled: boolean;
  stakingRewardRate: BN;
  maxStakeAmount: BN;
  emergencyPaused: boolean;
}

// Encontrar endereço do contador de NFTs
export async function findNftCounterPda(): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [NFT_COUNTER_SEED],
    PROGRAM_ID
  );
}

// Encontrar endereço da mint de NFT
export async function findNftMintPda(
  collection: PublicKey,
  count: number
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [
      NFT_MINT_SEED,
      collection.toBuffer(),
      new BN(count).toArrayLike(Buffer, 'le', 8)
    ],
    PROGRAM_ID
  );
}

// Encontrar endereço dos metadados de NFT
export async function findNftMetadataPda(mint: PublicKey): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [
      NFT_METADATA_SEED,
      mint.toBuffer()
    ],
    PROGRAM_ID
  );
}

// Encontrar endereço da conta de stake
export async function findStakeAccountPda(
  staker: PublicKey,
  tokenMint: PublicKey
): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [
      STAKE_ACCOUNT_SEED,
      staker.toBuffer(),
      tokenMint.toBuffer()
    ],
    PROGRAM_ID
  );
}

// Encontrar endereço da autoridade de stake
export async function findStakeAuthorityPda(): Promise<[PublicKey, number]> {
  return PublicKey.findProgramAddressSync(
    [STAKE_AUTHORITY_SEED],
    PROGRAM_ID
  );
}

// Função para converter período de staking para string legível
export function stakingPeriodToString(period: StakingPeriod): string {
  switch (period) {
    case StakingPeriod.Minutes1:
      return '1 minuto';
    case StakingPeriod.Minutes2:
      return '2 minutos';
    case StakingPeriod.Minutes5:
      return '5 minutos';
    case StakingPeriod.Minutes10:
      return '10 minutos';
    case StakingPeriod.Minutes30:
      return '30 minutos';
    default:
      return 'Desconhecido';
  }
}

// Função para formatar tempo restante em formato legível
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) {
    return 'Disponível agora';
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${remainingSeconds} segundos`;
  } else if (minutes === 1) {
    return `1 minuto e ${remainingSeconds} segundos`;
  } else {
    return `${minutes} minutos e ${remainingSeconds} segundos`;
  }
}

// Função para mintar um NFT
export async function mintNft(
  program: Program<AdrTokenMint>,
  wallet: web3.Keypair,
  collectionMetadata: PublicKey,
  name: string,
  symbol: string,
  uri: string,
  amount: number,
  paymentTokenMint: PublicKey
): Promise<Transaction> {
  // Buscar o contador de NFTs
  const [nftCounter] = await findNftCounterPda();
  
  // Obter o valor atual do contador (necessário fazer uma chamada ao programa)
  const counterAccount = await program.account.nftCounter.fetch(nftCounter);
  const count = counterAccount.count.toNumber();
  
  // Derivar o endereço da mint do NFT
  const [nftMint, nftMintBump] = await findNftMintPda(collectionMetadata, count);
  
  // Derivar o endereço dos metadados do NFT
  const [nftMetadata, nftMetadataBump] = await findNftMetadataPda(nftMint);
  
  // Obter a conta de token associada do pagador
  const payerPaymentTokenAccount = await getAssociatedTokenAddress(
    paymentTokenMint,
    wallet.publicKey
  );
  
  // Obter a conta de token associada para o NFT
  const nftTokenAccount = await getAssociatedTokenAddress(
    nftMint,
    wallet.publicKey
  );
  
  // Obter a conta de configuração
  const [config] = await PublicKey.findProgramAddressSync(
    [Buffer.from('config')], // Presumi que este é o seed usado (ajuste conforme necessário)
    PROGRAM_ID
  );
  
  // Criar a transação
  const tx = await program.methods
    .mintNftWithPayment(name, symbol, uri, new BN(amount))
    .accounts({
      payer: wallet.publicKey,
      nftCounter,
      nftMint,
      nftMetadata,
      nftTokenAccount,
      collectionMetadata,
      paymentTokenMint,
      payerPaymentTokenAccount,
      config,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();
  
  return tx;
}

// Função para fazer stake de tokens
export async function stakeTokens(
  program: Program<AdrTokenMint>,
  wallet: web3.Keypair,
  tokenMint: PublicKey,
  amount: number,
  period: StakingPeriod
): Promise<Transaction> {
  // Obter a conta de token associada do staker
  const stakerTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    wallet.publicKey
  );
  
  // Derivar o endereço da conta de stake
  const [stakeAccount, stakeAccountBump] = await findStakeAccountPda(
    wallet.publicKey,
    tokenMint
  );
  
  // Derivar o endereço da autoridade de stake
  const [stakeAuthority, stakeAuthorityBump] = await findStakeAuthorityPda();
  
  // Obter a conta de token associada para o stake
  const stakeTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    stakeAuthority,
    true // allowOwnerOffCurve: true para permitir que um PDA seja o dono
  );
  
  // Obter a conta de configuração
  const [config] = await PublicKey.findProgramAddressSync(
    [Buffer.from('config')], // Presumi que este é o seed usado (ajuste conforme necessário)
    PROGRAM_ID
  );
  
  // Criar a transação
  const tx = await program.methods
    .stakeTokens(new BN(amount), period)
    .accounts({
      staker: wallet.publicKey,
      tokenMint,
      stakerTokenAccount,
      stakeAccount,
      stakeTokenAccount,
      stakeAuthority,
      config,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .transaction();
  
  return tx;
}

// Função para fazer unstake de tokens
export async function unstakeTokens(
  program: Program<AdrTokenMint>,
  wallet: web3.Keypair,
  tokenMint: PublicKey,
  rewardTokenMint: PublicKey
): Promise<Transaction> {
  // Obter a conta de token associada do staker
  const stakerTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    wallet.publicKey
  );
  
  // Derivar o endereço da conta de stake
  const [stakeAccount, stakeAccountBump] = await findStakeAccountPda(
    wallet.publicKey,
    tokenMint
  );
  
  // Derivar o endereço da autoridade de stake
  const [stakeAuthority, stakeAuthorityBump] = await findStakeAuthorityPda();
  
  // Obter a conta de token associada para o stake
  const stakeTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    stakeAuthority,
    true // allowOwnerOffCurve: true para permitir que um PDA seja o dono
  );
  
  // Obter a conta de configuração
  const [config] = await PublicKey.findProgramAddressSync(
    [Buffer.from('config')], // Presumi que este é o seed usado (ajuste conforme necessário)
    PROGRAM_ID
  );
  
  // Criar a transação
  const tx = await program.methods
    .unstakeTokens()
    .accounts({
      staker: wallet.publicKey,
      tokenMint,
      rewardTokenMint,
      stakerTokenAccount,
      stakeTokenAccount,
      stakeAuthority,
      stakeAccount,
      config,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .transaction();
  
  return tx;
}

// Função para obter resumo do stake de um usuário
export async function getStakeSummary(
  program: Program<AdrTokenMint>,
  staker: PublicKey,
  tokenMint: PublicKey
): Promise<StakingSummary | null> {
  try {
    // Derivar o endereço da conta de stake
    const [stakeAccount] = await findStakeAccountPda(staker, tokenMint);
    
    // Obter a conta de configuração
    const [config] = await PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );
    
    // Obter o resumo do stake
    const summary = await program.methods
      .getStakeSummaryView()
      .accounts({
        staker,
        tokenMint,
        stakeAccount,
        config,
      })
      .view();
    
    return summary;
  } catch (error) {
    console.error('Erro ao obter resumo do stake:', error);
    return null;
  }
}

// Função para obter resumo da configuração
export async function getConfigSummary(
  program: Program<AdrTokenMint>
): Promise<ConfigSummary | null> {
  try {
    // Obter a conta de configuração
    const [config] = await PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID
    );
    
    // Obter o resumo da configuração
    const summary = await program.methods
      .getConfigSummaryView()
      .accounts({
        config,
      })
      .view();
    
    return summary;
  } catch (error) {
    console.error('Erro ao obter resumo da configuração:', error);
    return null;
  }
} 