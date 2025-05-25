const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('Corrigindo configuração da reserva de recompensas...');

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
        
        console.log("Token Mint:", tokenMint.toBase58());
        console.log("Config Account:", configAccount.toBase58());
        
        // Derivar PDA para autoridade de stake
        const [stakeAuthority, stakeAuthorityBump] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake_authority")],
            program.programId
        );
        console.log("Stake Authority PDA:", stakeAuthority.toBase58());
        
        // Verificar se a conta de token do stake authority existe
        let reserveTokenAccount;
        try {
            reserveTokenAccount = await getAssociatedTokenAddress(
                tokenMint,
                stakeAuthority,
                true // allowOwnerOffCurve = true para PDAs
            );
            console.log("Endereço da reserva:", reserveTokenAccount.toBase58());
            
            // Verificar se a conta existe
            try {
                const accountInfo = await getAccount(connection, reserveTokenAccount);
                console.log("✓ Conta de reserva já existe");
            } catch (error) {
                console.log("✕ Conta de reserva não existe. Criando...");
                
                // Criar a conta associada para o stake authority
                reserveTokenAccount = await createAssociatedTokenAccount(
                    connection,
                    walletKeypair,
                    tokenMint,
                    stakeAuthority,
                    { allowOwnerOffCurve: true }
                );
                console.log("✓ Conta de reserva criada:", reserveTokenAccount.toBase58());
            }
        } catch (error) {
            console.error("Erro ao verificar/criar conta de reserva:", error);
            throw error;
        }
        
        // Atualizar a configuração com a reserva
        console.log("\nAtualizando configuração do programa...");
        try {
            const tx = await program.methods
                .setRewardReserve(reserveTokenAccount)
                .accounts({
                    admin: walletKeypair.publicKey,
                    config: configAccount,
                })
                .rpc();
            
            console.log("Configuração atualizada com sucesso!");
            console.log("Transação:", tx);
            console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
            
            // Atualizar arquivo de configuração
            config.rewardReserveAccount = reserveTokenAccount.toBase58();
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log("Arquivo de configuração atualizado.");
            
            // Tentar inicializar a reserva
            console.log("\nInicializando a reserva de recompensas...");
            try {
                const initTx = await program.methods
                    .initializeRewardReserve()
                    .accounts({
                        admin: walletKeypair.publicKey,
                        rewardReserveAccount: reserveTokenAccount,
                        tokenMint: tokenMint,
                        stakeAuthority: stakeAuthority,
                        config: configAccount,
                        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                        systemProgram: anchor.web3.SystemProgram.programId,
                        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    })
                    .rpc();
                
                console.log("Reserva inicializada com sucesso!");
                console.log("Transação:", initTx);
                console.log(`Veja em: https://explorer.solana.com/tx/${initTx}?cluster=devnet`);
            } catch (e) {
                console.log("Aviso: Não foi possível inicializar a reserva, mas isso pode ser normal se já estiver inicializada");
                console.log(e.message);
            }
            
        } catch (error) {
            console.error("Erro ao atualizar configuração:", error);
            if (error.logs) {
                console.error("Logs de erro:");
                console.error(error.logs.join('\n'));
            }
            throw error;
        }
        
        console.log("\n✅ Configuração da reserva concluída!");
        console.log("Agora você pode tentar fazer unstake novamente com o script real-unstake-tokens.js");
        
    } catch (error) {
        console.error("Erro ao configurar reserva:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    }); 