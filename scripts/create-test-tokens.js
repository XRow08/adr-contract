const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createMint, createAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    // Quantidade a mintar
    const amount = 1000 * 10**9; // 1000 tokens
    
    console.log(`Criando e mintando ${amount / 10**9} tokens para teste...`);

    try {
        // Setup da conexão com a Devnet
        const connection = new Connection(
            process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
            { commitment: 'confirmed' }
        );
        console.log("Conectado à", connection.rpcEndpoint);

        // Carregar a wallet
        const walletKeypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
        );
        console.log("Usando wallet:", walletKeypair.publicKey.toBase58());

        // Criar um novo token mint
        console.log("Criando novo token mint...");
        const mintKeypair = Keypair.generate();
        console.log("Token Mint:", mintKeypair.publicKey.toBase58());
        
        const mintTx = await createMint(
            connection,
            walletKeypair,
            walletKeypair.publicKey,
            walletKeypair.publicKey,
            9 // 9 casas decimais
        );
        
        console.log("Token criado com sucesso!");
        console.log("Transação:", mintTx);
        console.log(`Veja em: https://explorer.solana.com/tx/${mintTx}?cluster=devnet`);
        
        // Criar uma conta de token para o usuário
        console.log("\nCriando conta de token para o usuário...");
        
        // Usar createAssociatedTokenAccount em vez de getOrCreateAssociatedTokenAccount
        const tokenAccount = await createAssociatedTokenAccount(
            connection,
            walletKeypair,
            mintKeypair.publicKey,
            walletKeypair.publicKey
        );
        
        console.log("Conta de token criada:", tokenAccount.toBase58());
        
        // Mintar tokens para o usuário
        console.log(`\nMintando ${amount / 10**9} tokens para o usuário...`);
        const mintToTx = await mintTo(
            connection,
            walletKeypair,
            mintKeypair.publicKey,
            tokenAccount,
            walletKeypair.publicKey,
            amount
        );
        
        console.log("Tokens mintados com sucesso!");
        console.log("Transação:", mintToTx);
        console.log(`Veja em: https://explorer.solana.com/tx/${mintToTx}?cluster=devnet`);
        
        // Verificar saldo
        const balance = await connection.getTokenAccountBalance(tokenAccount);
        console.log(`\nSaldo atual: ${balance.value.uiAmount} tokens`);
        
        // Atualizar o arquivo de configuração com o novo token
        console.log("\nAtualizando configuração do programa para usar o novo token...");
        
        // Carregar configurações e informações do deploy
        const configPath = path.join(__dirname, '../config/deploy-config.json');
        const deployInfoPath = path.join(__dirname, '../config/deploy-info.json');
        
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            config.paymentTokenMint = mintKeypair.publicKey.toBase58();
            config.userTokenAccount = tokenAccount.toBase58();
            config.tokenMintTime = new Date().toISOString();
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log("Configuração atualizada no deploy-config.json");
        }
        
        if (fs.existsSync(deployInfoPath)) {
            const deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
            deployInfo.paymentTokenMint = mintKeypair.publicKey.toBase58();
            deployInfo.userTokenAccount = tokenAccount.toBase58();
            deployInfo.tokenMintTime = new Date().toISOString();
            fs.writeFileSync(deployInfoPath, JSON.stringify(deployInfo, null, 2));
            console.log("Configuração atualizada no deploy-info.json");
        }
        
        console.log("\n✅ Processo concluído!");
        console.log(`Seu novo token ${mintKeypair.publicKey.toBase58()} foi criado e configurado no programa.`);
        console.log("Você precisa configurar o token no programa com o script set-pumpfun-token.js");
        console.log("Depois inicialize a reserva de recompensas com initialize-reward-reserve.js");
        console.log("Em seguida, deposite tokens na reserva com deposit-rewards.js");
        
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