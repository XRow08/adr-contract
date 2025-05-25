const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

const STAKE_AUTHORITY_SEED = Buffer.from("stake_authority");

async function main() {
    console.log('Inicializando reserva de recompensas para staking...');

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
        
        // Derivar PDA para autoridade de stake
        const [stakeAuthority, stakeAuthorityBump] = PublicKey.findProgramAddressSync(
            [STAKE_AUTHORITY_SEED],
            program.programId
        );
        console.log("Stake Authority PDA:", stakeAuthority.toBase58());
        
        // Obter a conta de reserva de recompensas
        const rewardReserveAccount = await getAssociatedTokenAddress(
            tokenMint,
            stakeAuthority,
            true // allowOwnerOffCurve = true para PDAs
        );
        console.log("Reward Reserve Account:", rewardReserveAccount.toBase58());
        
        // Inicializar a reserva
        console.log("\nEnviando transação para inicializar a reserva...");
        const tx = await program.methods
            .initializeRewardReserve()
            .accounts({
                admin: walletKeypair.publicKey,
                rewardReserveAccount: rewardReserveAccount,
                tokenMint: tokenMint,
                stakeAuthority: stakeAuthority,
                config: configAccount,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
                associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY
            })
            .rpc();
        
        console.log("Transação enviada:", tx);
        console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
        
        // Atualizar o arquivo de configuração
        config.rewardReserveAccount = rewardReserveAccount.toBase58();
        config.rewardReserveInitialized = true;
        config.rewardReserveInitTime = new Date().toISOString();
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log("\nInformações da reserva salvas em config/deploy-config.json");
        
        console.log("\n✅ Reserva de recompensas inicializada com sucesso!");
        console.log("Próximo passo: Depositar tokens na reserva com o script deposit-rewards.js");
        
    } catch (error) {
        if (error.logs) {
            console.error("Logs de erro do programa:");
            console.error(error.logs.join('\n'));
        }
        console.error("Erro ao inicializar reserva:", error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(1);
    }); 