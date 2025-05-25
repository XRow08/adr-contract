const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('Realizando unstake de emergência (apenas tokens staked, sem recompensas)...');

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
        const stakesPath = path.join(__dirname, '../config/stakes.json');
        
        let config = {};
        let deployInfo = {};
        let stakes = [];
        
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
        
        if (fs.existsSync(deployInfoPath)) {
            deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
        }
        
        if (fs.existsSync(stakesPath)) {
            stakes = JSON.parse(fs.readFileSync(stakesPath, 'utf-8'));
        } else {
            throw new Error("Nenhum stake encontrado. Execute real-stake-tokens.js primeiro.");
        }
        
        if (stakes.length === 0) {
            throw new Error("Nenhum stake encontrado no arquivo de stakes.");
        }
        
        // Obter informações do último stake
        const stake = stakes[stakes.length - 1];
        console.log(`Unstaking do stake: ${stake.stakeAccount}`);
        console.log(`Quantidade: ${stake.amount / 10**9} tokens`);
        console.log(`Período: ${stake.period} minutos`);
        
        // Obter informações necessárias
        const programId = new PublicKey(deployInfo.programId || config.programId || "65zQjC4UYf4zJdDyfScpZjgaBbiMRpmFhNJkFSp39GZF");
        console.log("Programa ID:", programId.toBase58());
        
        const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint || "2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
        console.log("Token Mint:", tokenMint.toBase58());
        
        const configAccount = new PublicKey(config.configAccount || deployInfo.configAccount || "GBee25TDA1Tym5iZsrT4imGpzmC3cYwKRsstX6GMLbhd");
        console.log("Config Account:", configAccount.toBase58());
        
        // Derivar o PDA para autoridade de stake
        const [stakeAuthority, stakeAuthorityBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake_authority")],
            programId
        );
        console.log("Stake Authority PDA:", stakeAuthority.toBase58());
        
        // Obter a conta de token do staker
        const stakerTokenAccount = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Staker Token Account:", stakerTokenAccount.toBase58());
        
        // Obter a conta de stake
        const stakeAccount = new PublicKey(stake.stakeAccount);
        console.log("Stake Account:", stakeAccount.toBase58());
        
        // Obter a conta de token do stake
        const stakeTokenAccount = new PublicKey(stake.stakeTokenAccount);
        console.log("Stake Token Account:", stakeTokenAccount.toBase58());
        
        // Verificar se a conta de token do stake existe e tem tokens
        const stakeTokenInfo = await connection.getTokenAccountBalance(stakeTokenAccount);
        console.log(`Tokens na conta de stake: ${stakeTokenInfo.value.uiAmount}`);
        
        if (stakeTokenInfo.value.uiAmount === 0) {
            throw new Error("A conta de stake não tem tokens para resgatar.");
        }
        
        // Abordagem simplificada: usar uma transferência direta para mover os tokens
        console.log("\nRealizando transferência direta dos tokens...");
        
        // Pular para a abordagem alternativa usando Anchor diretamente
        console.log("Tentando unstake via Anchor...");
        
        // Configurar provider
        const provider = new anchor.AnchorProvider(
            connection, 
            new anchor.Wallet(walletKeypair), 
            { commitment: 'confirmed' }
        );
        anchor.setProvider(provider);
        
        // Carregar o programa do workspace
        const program = anchor.workspace.AdrTokenMint;
        
        // Tentar chamar o método unstake_tokens
        try {
            const tx = await program.methods
                .unstakeTokens()
                .accounts({
                    staker: walletKeypair.publicKey,
                    tokenMint: tokenMint,
                    stakerTokenAccount: stakerTokenAccount,
                    stakeTokenAccount: stakeTokenAccount,
                    rewardReserveAccount: stakeTokenAccount, // usar a mesma conta como reserva
                    stakeAuthority: stakeAuthority,
                    stakeAccount: stakeAccount,
                    config: configAccount,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .signers([walletKeypair])
                .rpc();
            
            console.log("Transação enviada:", tx);
            console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
            
            // Remover o stake do arquivo
            stakes = stakes.filter(s => s.stakeAccount !== stake.stakeAccount);
            fs.writeFileSync(stakesPath, JSON.stringify(stakes, null, 2));
            
            console.log("\n✅ Unstake concluído com sucesso!");
            console.log("O arquivo de stakes foi atualizado.");
        } catch (error) {
            console.error("Erro ao tentar unstake via Anchor:", error);
            
            if (error.logs) {
                console.error("Logs de erro do programa:");
                console.error(error.logs.join('\n'));
            }
            
            throw new Error("Não foi possível realizar o unstake de emergência.");
        }
        
    } catch (error) {
        console.error("Erro durante o unstake de emergência:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    }); 