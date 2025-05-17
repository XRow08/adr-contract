const { Keypair, PublicKey, Connection } = require("@solana/web3.js");
const { mintTo, getOrCreateAssociatedTokenAccount } = require("@solana/spl-token");
const fs = require('fs');

// Valor padrão de tokens a serem enviados
const DEFAULT_AMOUNT = 100 * 10**9; // 100 tokens (com 9 casas decimais)

async function main() {
  try {
    // Verificar argumentos de linha de comando
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error("Uso: node airdrop-tokens.js <endereço-carteira> [quantidade]");
      process.exit(1);
    }

    // Obter endereço da carteira destinatária e quantidade
    const recipientWallet = args[0];
    const amount = args.length > 1 ? parseInt(args[1]) * 10**9 : DEFAULT_AMOUNT;

    // Carregar configuração
    const deployInfo = JSON.parse(fs.readFileSync('./deploy-info.json', 'utf-8'));
    
    // Carregar a wallet do admin
    const adminKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    
    // Reconstruir o keypair do token mint
    const paymentTokenMint = Keypair.fromSecretKey(
      Uint8Array.from(deployInfo.privateKeys.paymentTokenMint)
    );
    
    console.log("Preparando airdrop de tokens...");
    console.log("Token mint:", paymentTokenMint.publicKey.toString());
    console.log("Admin wallet:", adminKeypair.publicKey.toString());
    console.log("Destinatário:", recipientWallet);
    console.log("Quantidade:", amount);
    
    // Configurar provider
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    
    // Criar ou obter a conta associada do destinatário
    console.log("Obtendo conta associada do destinatário...");
    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      paymentTokenMint.publicKey,
      new PublicKey(recipientWallet)
    );
    
    console.log("Conta do destinatário:", recipientTokenAccount.address.toString());
    
    // Mintar tokens para o destinatário
    console.log(`Mintando ${amount} tokens para o destinatário...`);
    const tx = await mintTo(
      connection,
      adminKeypair,
      paymentTokenMint.publicKey,
      recipientTokenAccount.address,
      adminKeypair.publicKey,
      amount
    );
    
    console.log(`Tokens enviados com sucesso!`);
    console.log(`Transação: ${tx}`);
    console.log(`Verificar em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
  } catch (err) {
    console.error("Erro ao enviar tokens:", err);
    throw err;
  }
}

main().catch(console.error); 