const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Constants
const STAKE_ACCOUNT_SEED = Buffer.from("stake_account");
const STAKE_AUTHORITY_SEED = Buffer.from("stake_authority");

// Enum para períodos de staking correspondente ao enum no programa
const StakingPeriod = {
  Minutes1: { value: 1 },
  Minutes2: { value: 2 },
  Minutes5: { value: 5 },
  Minutes10: { value: 10 },
  Minutes30: { value: 30 }
};

async function main() {
  // Parâmetros de staking
  const amount = 1 * 10**9; // 1 token
  const period = StakingPeriod.Minutes1; // 1 minuto
  
  console.log(`Realizando stake de ${amount / 10**9} tokens por ${period.value} minutos...`);

  try {
    // Setup da conexão com a Devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      { commitment: 'confirmed' }
    );
    console.log("Conectado à", connection.rpcEndpoint);

    // Carregar a wallet do usuário
    const walletKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    console.log("Usando wallet:", walletKeypair.publicKey.toBase58());

    // Configurar o provider
    const provider = new anchor.AnchorProvider(
      connection, 
      new anchor.Wallet(walletKeypair), 
      { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);

    // Carregar o programa do workspace
    const program = anchor.workspace.AdrTokenMint;
    console.log("Programa ID:", program.programId.toBase58());
    
    // Carregar configurações e informações do deploy
    const configPath = path.join(__dirname, '../config/deploy-config.json');
    const deployInfoPath = path.join(__dirname, '../config/deploy-info.json');
    
    let config = {};
    let deployInfo = {};
    
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } else {
      throw new Error("Arquivo de configuração não encontrado. Execute initialize-collection.js primeiro.");
    }
    
    if (fs.existsSync(deployInfoPath)) {
      deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
    }
    
    // Obter informações necessárias
    const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint);
    const configAccount = new PublicKey(config.configAccount);
    
    console.log("Token Mint:", tokenMint.toBase58());
    console.log("Config Account:", configAccount.toBase58());
    
    // Derivar o PDA para a conta de stake
    const [stakeAccount, stakeAccountBump] = PublicKey.findProgramAddressSync(
      [
        STAKE_ACCOUNT_SEED,
        walletKeypair.publicKey.toBuffer(),
        tokenMint.toBuffer()
      ],
      program.programId
    );
    console.log("Stake Account PDA:", stakeAccount.toBase58());
    
    // Derivar PDA para autoridade de stake
    const [stakeAuthority, stakeAuthorityBump] = PublicKey.findProgramAddressSync(
      [STAKE_AUTHORITY_SEED],
      program.programId
    );
    console.log("Stake Authority PDA:", stakeAuthority.toBase58());
    
    // Obter a conta de token do staker
    const stakerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      walletKeypair.publicKey
    );
    console.log("Staker Token Account:", stakerTokenAccount.toBase58());
    
    // Obter a conta de token para o stake
    const stakeTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      stakeAuthority,
      true // allowOwnerOffCurve = true para PDAs
    );
    console.log("Stake Token Account:", stakeTokenAccount.toBase58());
    
    // Realizar o stake
    console.log("\nEnviando transação de stake...");
    const tx = await program.methods
      .stakeTokens(
        new anchor.BN(amount),
        { [Object.keys(StakingPeriod).find(key => StakingPeriod[key].value === period.value).toLowerCase()]: {} }
      )
      .accounts({
        staker: walletKeypair.publicKey,
        tokenMint: tokenMint,
        stakerTokenAccount: stakerTokenAccount,
        stakeAccount: stakeAccount,
        stakeTokenAccount: stakeTokenAccount,
        stakeAuthority: stakeAuthority,
        config: configAccount,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY
      })
      .rpc();
    
    console.log("Transação enviada:", tx);
    console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Salvar informações do stake para referência futura
    const stakesPath = path.join(__dirname, '../config/stakes.json');
    let stakes = [];
    
    if (fs.existsSync(stakesPath)) {
      try {
        stakes = JSON.parse(fs.readFileSync(stakesPath, 'utf-8'));
      } catch (error) {
        console.warn('Aviso: Não foi possível carregar o arquivo de stakes existente.');
      }
    }
    
    // Calcular quando estará disponível para unstake
    const now = new Date();
    const unlockTime = new Date(now.getTime() + (period.value * 60 * 1000));
    
    stakes.push({
      staker: walletKeypair.publicKey.toBase58(),
      stakeAccount: stakeAccount.toBase58(),
      stakeTokenAccount: stakeTokenAccount.toBase58(),
      amount: amount,
      period: period.value,
      stakeTime: now.toISOString(),
      unlockTime: unlockTime.toISOString(),
      transaction: tx
    });
    
    // Criar diretório config se não existir
    if (!fs.existsSync(path.join(__dirname, '../config'))) {
      fs.mkdirSync(path.join(__dirname, '../config'));
    }
    
    fs.writeFileSync(stakesPath, JSON.stringify(stakes, null, 2));
    console.log('\nInformações do stake salvas em config/stakes.json');
    console.log(`Você poderá fazer unstake após: ${unlockTime.toLocaleString()}`);
    
  } catch (error) {
    if (error.logs) {
      console.error("Logs de erro do programa:");
      console.error(error.logs.join('\n'));
    }
    console.error("Erro ao fazer stake:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 