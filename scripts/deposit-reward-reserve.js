const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
  // Quantidade de tokens a depositar na reserva (100 tokens com 9 casas decimais)
  const amount = 100 * 10 ** 9; 

  try {
    // Carregar informações de configuração
    const configPath = path.join(__dirname, '../config/deploy-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('Arquivo de configuração não encontrado. Execute primeiro os scripts de deploy.');
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!config.paymentTokenMint) {
      throw new Error('Token de pagamento não encontrado. Execute primeiro o script create-token.');
    }
    
    if (!config.stakeAuthority) {
      throw new Error('Autoridade de stake não encontrada. Execute primeiro o script initialize-reward-reserve.');
    }
    
    console.log(`Depositando ${amount / 10**9} tokens na reserva de recompensas...`);

    // Setup da conexão com a Devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      { commitment: 'confirmed' }
    );
    console.log("Conectado à", connection.rpcEndpoint);

    // Carregar a wallet do deploy
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

    // Obter a conta associada do admin para o token
    const adminTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(config.paymentTokenMint),
      walletKeypair.publicKey
    );
    console.log("Conta de token do admin:", adminTokenAccount.toBase58());

    // Obter a conta associada da reserva para o token
    const rewardReserveAccount = await getAssociatedTokenAddress(
      new PublicKey(config.paymentTokenMint),
      new PublicKey(config.stakeAuthority),
      true // allowOwnerOffCurve = true para PDAs
    );
    console.log("Conta da reserva de recompensas:", rewardReserveAccount.toBase58());

    // Depositar tokens na reserva
    console.log("Enviando transação para depositar tokens na reserva...");
    const tx = await program.methods
      .depositRewardReserve(new anchor.BN(amount))
      .accounts({
        admin: walletKeypair.publicKey,
        adminTokenAccount: adminTokenAccount,
        rewardReserveAccount: rewardReserveAccount,
        tokenMint: new PublicKey(config.paymentTokenMint),
        stakeAuthority: new PublicKey(config.stakeAuthority),
        config: new PublicKey(config.configAccount),
      })
      .rpc();

    console.log("Transação enviada:", tx);
    console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Atualizar o arquivo de configuração
    config.rewardReserveAccount = rewardReserveAccount.toBase58();
    config.rewardReserveDeposit = (config.rewardReserveDeposit || 0) + amount;
    config.rewardReserveDepositTimestamp = new Date().toISOString();
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("Depósito na reserva de recompensas concluído e salvo em config/deploy-config.json");

  } catch (error) {
    console.error("Erro ao depositar na reserva de recompensas:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 