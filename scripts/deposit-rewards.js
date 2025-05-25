const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Constants
const CONFIG_ACCOUNT_SEED = Buffer.from("config");
const STAKE_AUTHORITY_SEED = Buffer.from("stake_authority");

async function verifyTransaction(connection, signature) {
    console.log('Verificando transação:', signature);
    try {
        const status = await connection.getSignatureStatus(signature);
        if (status.value === null) {
            console.log('Transaction not found. It may have failed or not been processed yet.');
            return false;
        }
        
        if (status.value.err) {
            console.log('Transaction failed:', status.value.err);
            return false;
        }

        if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
            console.log('Transaction confirmed!');
            return true;
        }

        console.log('Transaction status:', status.value.confirmationStatus);
        return false;
    } catch (error) {
        console.error('Error verifying transaction:', error);
        return false;
    }
}

async function main() {
    console.log("==== Depositando Tokens na Reserva de Recompensas ====\n");

    // Quantidade a depositar (1000 tokens)
    const depositAmount = 1000 * 10**9;
    
    console.log(`Depositando ${depositAmount / 10**9} tokens na reserva de recompensas...`);

    try {
        // Setup da conexão com a Devnet
        const connection = new Connection(
            process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
            { commitment: 'confirmed' }
        );
        console.log("Conectado à", connection.rpcEndpoint);

        // Carregar a wallet do admin
        const walletKeypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
        );
        console.log("Usando wallet admin:", walletKeypair.publicKey.toBase58());

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
        
        // Verificar se a reserva foi inicializada
        if (!config.rewardReserveAccount) {
            throw new Error("Reserva de recompensas não inicializada. Execute initialize-reward-reserve.js primeiro.");
        }
        
        // Derivar PDA para autoridade de stake
        const [stakeAuthority] = PublicKey.findProgramAddressSync(
            [STAKE_AUTHORITY_SEED],
            program.programId
        );
        console.log("Stake Authority PDA:", stakeAuthority.toBase58());
        
        // Obter a conta do token do admin
        const adminTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Admin Token Account:", adminTokenAccount.toBase58());
        
        // Verificar saldo do admin
        const adminTokenBalance = await connection.getTokenAccountBalance(adminTokenAccount);
        console.log(`Saldo atual do admin: ${adminTokenBalance.value.uiAmount} tokens`);
        
        if (Number(adminTokenBalance.value.amount) < depositAmount) {
            throw new Error(`Saldo insuficiente. Você precisa de pelo menos ${depositAmount / 10**9} tokens.`);
        }
        
        // Obter a conta de reserva de recompensas
        const rewardReserveAccount = new PublicKey(config.rewardReserveAccount);
        console.log("Reward Reserve Account:", rewardReserveAccount.toBase58());
        
        // Verificar saldo atual da reserva
        try {
            const reserveBalance = await connection.getTokenAccountBalance(rewardReserveAccount);
            console.log(`Saldo atual da reserva: ${reserveBalance.value.uiAmount} tokens`);
        } catch (error) {
            console.warn("Não foi possível verificar o saldo da reserva. Pode ser que ela ainda não esteja inicializada.");
        }
        
        // Depositar tokens na reserva
        console.log(`\nDepositando ${depositAmount / 10**9} tokens na reserva...`);
        const tx = await program.methods
            .depositRewardReserve(new anchor.BN(depositAmount))
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
        
        // Verificar novo saldo da reserva
        try {
            const newReserveBalance = await connection.getTokenAccountBalance(rewardReserveAccount);
            console.log(`\nNovo saldo da reserva: ${newReserveBalance.value.uiAmount} tokens`);
        } catch (error) {
            console.warn("Não foi possível verificar o novo saldo da reserva.");
        }
        
        // Atualizar o arquivo de configuração
        config.lastDepositAmount = depositAmount;
        config.lastDepositTime = new Date().toISOString();
        config.totalDeposited = (config.totalDeposited || 0) + depositAmount;
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log("\nInformações do depósito salvas em config/deploy-config.json");
        
        console.log("\n✅ Tokens depositados com sucesso na reserva de recompensas!");
        console.log("Próximo passo: Configurar o staking com o script configure-staking.js");
        
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