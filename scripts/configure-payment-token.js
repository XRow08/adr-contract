const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Carregar informações de configuração
    const configPath = path.join(__dirname, '../config/deploy-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error('Arquivo de configuração não encontrado. Execute primeiro os scripts de deploy e criação de token.');
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const paymentTokenMint = new PublicKey(config.paymentTokenMint);
    
    console.log("Configurando token de pagamento:", paymentTokenMint.toBase58());

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

    // Buscar a conta de configuração
    const [configAccount] = await PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
    console.log("Conta de configuração:", configAccount.toBase58());

    // Configurar o token de pagamento
    console.log("Enviando transação para configurar token de pagamento...");
    const tx = await program.methods
      .setPaymentToken(paymentTokenMint)
      .accounts({
        admin: walletKeypair.publicKey,
        config: configAccount,
      })
      .rpc();

    console.log("Transação enviada:", tx);
    console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    // Atualizar o arquivo de configuração
    config.configAccount = configAccount.toBase58();
    config.paymentTokenConfigured = true;
    config.paymentTokenConfigTimestamp = new Date().toISOString();
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("Configuração do token de pagamento concluída e salva em config/deploy-config.json");

  } catch (error) {
    console.error("Erro ao configurar token de pagamento:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 