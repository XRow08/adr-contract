const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    // Quantidade a depositar
    const amount = 900 * 10**9; // 10 tokens
    
    console.log(`Depositando ${amount / 10**9} tokens na reserva de recompensas...`);

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
        
        // Carregar o programa do workspace
        const program = anchor.workspace.AdrTokenMint;
        console.log("Programa ID:", program.programId.toBase58());
        
        // Obter informações necessárias
        const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint);
        const configAccount = new PublicKey(config.configAccount);
        
        if (!config.rewardReserveAccount) {
            throw new Error("Reserva de recompensas não configurada. Execute o script fix-reward-reserve.js primeiro.");
        }
        
        console.log("Token Mint:", tokenMint.toBase58());
        console.log("Config Account:", configAccount.toBase58());
        
        // Derivar PDA para autoridade de stake
        const [stakeAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake_authority")],
            program.programId
        );
        console.log("Stake Authority PDA:", stakeAuthority.toBase58());
        
        // Obter conta de token do admin
        const adminTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Admin Token Account:", adminTokenAccount.toBase58());
        
        // Verificar o saldo do admin
        const adminBalance = await connection.getTokenAccountBalance(adminTokenAccount);
        console.log(`Saldo atual do admin: ${adminBalance.value.uiAmount} tokens`);
        
        if (Number(adminBalance.value.amount) < amount) {
            throw new Error(`Saldo insuficiente. Você precisa de pelo menos ${amount / 10**9} tokens.`);
        }
        
        // Obter a conta de reserva
        const rewardReserveAccount = new PublicKey(config.rewardReserveAccount);
        console.log("Reward Reserve Account:", rewardReserveAccount.toBase58());
        
        // Verificar o saldo da reserva antes do depósito
        try {
            const reserveBalance = await connection.getTokenAccountBalance(rewardReserveAccount);
            console.log(`Saldo atual da reserva: ${reserveBalance.value.uiAmount} tokens`);
        } catch (error) {
            console.log("Não foi possível verificar o saldo da reserva:", error.message);
        }
        
        // Depositar tokens na reserva
        console.log("\nDepositing tokens...");
        const tx = await program.methods
            .depositRewardReserve(new anchor.BN(amount))
            .accounts({
                admin: walletKeypair.publicKey,
                adminTokenAccount: adminTokenAccount,
                rewardReserveAccount: rewardReserveAccount,
                tokenMint: tokenMint,
                stakeAuthority: stakeAuthority,
                config: configAccount,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            })
            .rpc();
        
        console.log("Transação enviada:", tx);
        console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        
        // Verificar o novo saldo da reserva
        try {
            // Esperar um pouco para que a transação seja processada
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const newReserveBalance = await connection.getTokenAccountBalance(rewardReserveAccount);
            console.log(`\nNovo saldo da reserva: ${newReserveBalance.value.uiAmount} tokens`);
        } catch (error) {
            console.log("Não foi possível verificar o novo saldo da reserva:", error.message);
        }
        
        console.log("\n✅ Depósito concluído com sucesso!");
        console.log("Agora você pode tentar fazer unstake novamente com o script real-unstake-tokens.js");
        
    } catch (error) {
        if (error.logs) {
            console.error("Logs de erro do programa:");
            console.error(error.logs.join('\n'));
        }
        console.error("Erro ao depositar tokens:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    }); 