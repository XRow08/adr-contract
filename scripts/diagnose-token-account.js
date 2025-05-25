const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('Diagnosticando contas de token...');

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
            console.log("Configuração carregada do deploy-config.json");
        }
        
        if (fs.existsSync(deployInfoPath)) {
            deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
            console.log("Informações carregadas do deploy-info.json");
        }
        
        if (Object.keys(config).length === 0 && Object.keys(deployInfo).length === 0) {
            throw new Error("Nenhum arquivo de configuração encontrado.");
        }
        
        // Obter informações do programa
        const programId = new PublicKey(deployInfo.programId || config.programId || "65zQjC4UYf4zJdDyfScpZjgaBbiMRpmFhNJkFSp39GZF");
        console.log("\n==== Informações do Programa ====");
        console.log("Program ID:", programId.toBase58());
        
        // Verificar se o programa existe
        const programInfo = await connection.getAccountInfo(programId);
        if (programInfo) {
            console.log("✅ Programa encontrado na blockchain");
            console.log(`   Tamanho: ${programInfo.data.length} bytes`);
            console.log(`   Proprietário: ${programInfo.owner.toBase58()}`);
        } else {
            console.log("❌ Programa não encontrado na blockchain!");
        }
        
        // Obter informações do token
        const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint || "2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
        console.log("\n==== Informações do Token ====");
        console.log("Token Mint:", tokenMint.toBase58());
        
        // Verificar se o token existe
        const tokenInfo = await connection.getAccountInfo(tokenMint);
        if (tokenInfo) {
            console.log("✅ Token encontrado na blockchain");
            console.log(`   Tamanho: ${tokenInfo.data.length} bytes`);
            console.log(`   Proprietário: ${tokenInfo.owner.toBase58()}`);
            
            if (tokenInfo.owner.equals(TOKEN_PROGRAM_ID)) {
                console.log("✅ Token pertence ao Token Program (correto)");
            } else {
                console.log("❌ Token não pertence ao Token Program!");
            }
        } else {
            console.log("❌ Token não encontrado na blockchain!");
        }
        
        // Obter a conta de token do staker
        const stakerTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("\n==== Informações da Conta de Token do Staker ====");
        console.log("Staker Token Account:", stakerTokenAccount.toBase58());
        
        // Verificar se a conta de token existe
        const tokenAccountInfo = await connection.getAccountInfo(stakerTokenAccount);
        if (tokenAccountInfo) {
            console.log("✅ Conta de token encontrada na blockchain");
            console.log(`   Tamanho: ${tokenAccountInfo.data.length} bytes`);
            console.log(`   Proprietário: ${tokenAccountInfo.owner.toBase58()}`);
            
            if (tokenAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
                console.log("✅ Conta pertence ao Token Program (correto)");
                
                try {
                    const balance = await connection.getTokenAccountBalance(stakerTokenAccount);
                    console.log(`✅ Saldo: ${balance.value.uiAmount} tokens`);
                    
                    if (balance.value.uiAmount > 0) {
                        console.log("✅ Saldo positivo (suficiente para stake)");
                    } else {
                        console.log("⚠️ Saldo zero (insuficiente para stake)");
                    }
                } catch (error) {
                    console.log("❌ Erro ao obter saldo:", error.message);
                }
            } else {
                console.log("❌ Conta não pertence ao Token Program!");
            }
        } else {
            console.log("❌ Conta de token não encontrada na blockchain!");
        }
        
        // Verificar a conta de configuração
        const configAccount = new PublicKey(config.configAccount || deployInfo.configAccount || "GBee25TDA1Tym5iZsrT4imGpzmC3cYwKRsstX6GMLbhd");
        console.log("\n==== Informações da Conta de Configuração ====");
        console.log("Config Account:", configAccount.toBase58());
        
        const configAccountInfo = await connection.getAccountInfo(configAccount);
        if (configAccountInfo) {
            console.log("✅ Conta de configuração encontrada na blockchain");
            console.log(`   Tamanho: ${configAccountInfo.data.length} bytes`);
            console.log(`   Proprietário: ${configAccountInfo.owner.toBase58()}`);
            
            if (configAccountInfo.owner.equals(programId)) {
                console.log("✅ Conta pertence ao programa (correto)");
            } else {
                console.log("❌ Conta não pertence ao programa!");
            }
        } else {
            console.log("❌ Conta de configuração não encontrada na blockchain!");
        }
        
        // Derivar PDA para autoridade de stake
        const [stakeAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake_authority")],
            programId
        );
        console.log("\n==== Informações da Autoridade de Stake ====");
        console.log("Stake Authority PDA:", stakeAuthority.toBase58());
        
        // Verificar a conta de reserva de recompensas
        if (config.rewardReserveAccount) {
            const rewardReserveAccount = new PublicKey(config.rewardReserveAccount);
            console.log("\n==== Informações da Reserva de Recompensas ====");
            console.log("Reward Reserve Account:", rewardReserveAccount.toBase58());
            
            const reserveInfo = await connection.getAccountInfo(rewardReserveAccount);
            if (reserveInfo) {
                console.log("✅ Conta de reserva encontrada na blockchain");
                console.log(`   Tamanho: ${reserveInfo.data.length} bytes`);
                console.log(`   Proprietário: ${reserveInfo.owner.toBase58()}`);
                
                if (reserveInfo.owner.equals(TOKEN_PROGRAM_ID)) {
                    console.log("✅ Conta pertence ao Token Program (correto)");
                    
                    try {
                        const balance = await connection.getTokenAccountBalance(rewardReserveAccount);
                        console.log(`✅ Saldo da reserva: ${balance.value.uiAmount} tokens`);
                        
                        if (balance.value.uiAmount > 0) {
                            console.log("✅ Reserva possui saldo (suficiente para recompensas)");
                        } else {
                            console.log("⚠️ Reserva com saldo zero (insuficiente para recompensas)");
                        }
                    } catch (error) {
                        console.log("❌ Erro ao obter saldo da reserva:", error.message);
                    }
                } else {
                    console.log("❌ Conta de reserva não pertence ao Token Program!");
                }
            } else {
                console.log("❌ Conta de reserva não encontrada na blockchain!");
            }
        } else {
            console.log("\n⚠️ Reserva de recompensas não configurada");
        }
        
        console.log("\n==== Diagnóstico Concluído ====");
        console.log("Baseado na análise, verifique os itens marcados com ❌ para resolver o problema.");
        
    } catch (error) {
        console.error("Erro durante o diagnóstico:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    }); 