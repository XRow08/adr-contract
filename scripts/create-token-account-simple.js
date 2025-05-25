const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const fs = require('fs');

async function main() {
    try {
        // Setup da conexão com a Devnet
        const connection = new Connection(
            'https://api.devnet.solana.com',
            { commitment: 'confirmed' }
        );
        console.log("Conectado à", connection.rpcEndpoint);

        // Carregar a wallet do usuário
        const walletKeypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
        );
        console.log("Usando wallet:", walletKeypair.publicKey.toBase58());

        // Token existente
        const tokenMint = new PublicKey("2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
        console.log("Token Mint:", tokenMint.toBase58());
        
        // Obter o endereço da conta associada
        const associatedTokenAddress = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Endereço da conta associada:", associatedTokenAddress.toBase58());
        
        // Verificar se a conta já existe
        const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
        
        if (accountInfo) {
            console.log("Conta já existe! Não é necessário criar.");
            return;
        }
        
        // Criar a conta associada
        console.log("Criando conta associada...");
        
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                walletKeypair.publicKey, // pagador
                associatedTokenAddress, // conta a ser criada
                walletKeypair.publicKey, // proprietário
                tokenMint // mint
            )
        );
        
        // Enviar e confirmar a transação
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [walletKeypair]
        );
        
        console.log("Conta criada com sucesso!");
        console.log("Assinatura:", signature);
        console.log(`Veja em: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
        
    } catch (error) {
        console.error("Erro:", error);
    }
}

main()
    .then(() => console.log("Concluído!"))
    .catch(console.error); 