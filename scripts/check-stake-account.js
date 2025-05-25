const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Constants
const STAKE_ACCOUNT_SEED = Buffer.from("stake_account");

async function main() {
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
      throw new Error("Arquivo de configuração não encontrado.");
    }
    
    if (fs.existsSync(deployInfoPath)) {
      deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
    }
    
    // Obter informações necessárias
    const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint);
    console.log("Token Mint:", tokenMint.toBase58());
    
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
    
    // Tentar buscar a conta de stake
    console.log("\nBuscando informações da conta de stake...");
    try {
      const stakeInfo = await program.account.stakeAccount.fetch(stakeAccount);
      
      console.log("\n==== Informações da Conta de Stake ====");
      console.log("Proprietário:", stakeInfo.owner.toBase58());
      console.log("Quantidade:", stakeInfo.amount.toString(), "lamports (", stakeInfo.amount.toNumber() / 10**9, "tokens)");
      
      const startTime = new Date(stakeInfo.startTime.toNumber() * 1000);
      const unlockTime = new Date(stakeInfo.unlockTime.toNumber() * 1000);
      
      console.log("Data de início:", startTime.toLocaleString());
      console.log("Data de desbloqueio:", unlockTime.toLocaleString());
      
      // Verificar o objeto period para ver sua estrutura exata
      console.log("\nObjeto period (estrutura bruta):", stakeInfo.period);
      
      // Tentar determinar o período de staking
      let periodLabel = "Desconhecido";
      if (stakeInfo.period) {
        if (stakeInfo.period.minutes1 !== undefined) periodLabel = "1 Minuto";
        if (stakeInfo.period.minutes2 !== undefined) periodLabel = "2 Minutos";
        if (stakeInfo.period.minutes5 !== undefined) periodLabel = "5 Minutos";
        if (stakeInfo.period.minutes10 !== undefined) periodLabel = "10 Minutos";
        if (stakeInfo.period.minutes30 !== undefined) periodLabel = "30 Minutos";
      }
      
      console.log("Período de staking:", periodLabel);
      console.log("Reivindicado:", stakeInfo.claimed ? "Sim" : "Não");
      
      // Verificar tempo restante
      const now = Date.now() / 1000;
      const secondsLeft = stakeInfo.unlockTime.toNumber() - now;
      if (secondsLeft > 0) {
        console.log("Tempo restante:", formatTimeRemaining(secondsLeft));
      } else {
        console.log("Status: Disponível para reivindicar");
      }
      
    } catch (error) {
      console.error("Erro ao buscar a conta de stake:", error);
      console.log("A conta de stake pode não existir ou houve um erro ao buscá-la.");
    }
    
  } catch (error) {
    console.error("Erro:", error);
    process.exit(1);
  }
}

// Função para formatar tempo restante em formato legível
function formatTimeRemaining(seconds) {
  if (seconds <= 0) {
    return 'Disponível agora';
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (minutes === 0) {
    return `${remainingSeconds} segundos`;
  } else if (minutes === 1) {
    return `1 minuto e ${remainingSeconds} segundos`;
  } else {
    return `${minutes} minutos e ${remainingSeconds} segundos`;
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 