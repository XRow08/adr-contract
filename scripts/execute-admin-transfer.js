import {
  Keypair,
  Connection,
  PublicKey,
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as borsh from '@project-serum/borsh';
import * as fs from 'fs';

// Índice da instrução updateAdmin no programa (baseado na ordem no código Rust)
const UPDATE_ADMIN_IX = 10;

// Definir o layout da instrução
const updateAdminInstructionLayout = borsh.struct([
  borsh.u8('instruction'),
  borsh.publicKey('newAdmin'),
]);

async function main() {
  try {
    // Verificar argumentos
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error("Uso: ts-node execute-admin-transfer.ts <endereço-nova-wallet-admin>");
      process.exit(1);
    }
    
    // Obter endereço da nova wallet admin
    const newAdminAddress = new PublicKey(args[0]);
    console.log("Nova wallet admin:", newAdminAddress.toString());
    
    // Carregar configuração
    const deployInfo = JSON.parse(fs.readFileSync('./deploy-info.json', 'utf-8'));
    
    // Carregar a wallet do admin atual
    const adminKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    
    // Configurar conexão
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    
    // ID do programa deployado
    const programId = new PublicKey(deployInfo.programId);
    
    // Configuração da conta
    const configAddress = new PublicKey(deployInfo.configAddress);
    
    console.log("Preparando transferência de admin...");
    console.log("Programa:", programId.toString());
    console.log("Admin atual:", adminKeypair.publicKey.toString());
    console.log("Config:", configAddress.toString());
    
    // Criar buffer para os dados da instrução
    const data = Buffer.alloc(updateAdminInstructionLayout.span);
    updateAdminInstructionLayout.encode(
      {
        instruction: UPDATE_ADMIN_IX,
        newAdmin: newAdminAddress,
      },
      data
    );
    
    // Criar a instrução
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true }, // current_admin
        { pubkey: configAddress, isSigner: false, isWritable: true }, // config
      ],
      programId,
      data,
    });
    
    // Criar e enviar a transação
    const transaction = new Transaction().add(instruction);
    
    console.log("Enviando transação...");
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [adminKeypair],
      { commitment: 'confirmed' }
    );
    
    console.log("Transferência concluída com sucesso!");
    console.log(`Transação: ${signature}`);
    console.log(`Verificar em: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    console.log("\nIMPORTANTE: Salve o arquivo deploy-info.json com as chaves privadas antes de compartilhar!");
  } catch (err) {
    console.error("Erro ao transferir admin:", err);
    throw err;
  }
}

main().catch(console.error); 