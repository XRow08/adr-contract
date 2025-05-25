const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('Criando conta de token associada...');

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

        // Carregar configurações e informações do deploy
        const configPath = path.join(__dirname, '../config/deploy-config.json');
        const deployInfoPath = path.join(__dirname, '../config/deploy-info.json');
        
        let config = {};
        let deployInfo = {};
        
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } else if (fs.existsSync(deployInfoPath)) {
            deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
        } else {
            throw new Error("Nenhum arquivo de configuração encontrado.");
        }
        
        // Obter informações necessárias - token específico para o seu projeto
        const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint || "2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
        console.log("Token Mint:", tokenMint.toBase58());
        
        // Obter a conta de token do staker
        const stakerTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Staker Token Account:", stakerTokenAccount.toBase58());
        
        // Verificar se a conta existe
        const accountInfo = await connection.getAccountInfo(stakerTokenAccount);
        
        if (!accountInfo) {
            console.log("Conta de token não encontrada. Criando nova conta...");
            
            const tx = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    walletKeypair.publicKey, // pagador
                    stakerTokenAccount, // conta a ser criada
                    walletKeypair.publicKey, // proprietário
                    tokenMint // mint
                )
            );
            
            const signature = await sendAndConfirmTransaction(
                connection, 
                tx, 
                [walletKeypair],
                { commitment: 'confirmed' }
            );
            
            console.log("Conta de token criada com sucesso!");
            console.log("Assinatura da transação:", signature);
            console.log(`Veja em: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
            
            // Verificar novamente
            try {
                const newAccountInfo = await connection.getAccountInfo(stakerTokenAccount);
                if (newAccountInfo) {
                    console.log("✅ Verificação confirmada: Conta criada com sucesso!");
                } else {
                    console.log("⚠️ Aviso: Não foi possível verificar a criação da conta.");
                }
            } catch (error) {
                console.warn("⚠️ Erro ao verificar a nova conta:", error.message);
            }
        } else {
            console.log("✅ Conta de token já existe!");
            
            try {
                const balance = await connection.getTokenAccountBalance(stakerTokenAccount);
                console.log(`Saldo atual: ${balance.value.uiAmount} tokens`);
                
                if (balance.value.uiAmount === 0) {
                    console.log("\n⚠️ Você não possui tokens. Você precisa obter tokens para fazer stake.");
                    console.log("Opções:");
                    console.log("1. Execute o script create-token.js para criar e mintar novos tokens");
                    console.log("2. Peça a alguém para transferir tokens para sua conta");
                }
            } catch (error) {
                console.warn("⚠️ Erro ao verificar saldo:", error.message);
            }
        }
        
        console.log("\n✅ Processo concluído!");
        console.log("Agora você pode executar scripts/real-stake-tokens.js para fazer stake dos seus tokens");
        
    } catch (error) {
        console.error("Erro:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    }); 