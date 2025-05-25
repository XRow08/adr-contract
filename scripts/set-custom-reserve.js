const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Constants
const CONFIG_ACCOUNT_SEED = Buffer.from("config");

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
    // Setup da conexão com a Devnet (mude para mainnet quando for para produção)
    const connection = new Connection(
        process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
        {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000 // 60 seconds
        }
    );
    console.log('Usando provider URL:', connection.rpcEndpoint);

    // Carregar a wallet admin do arquivo
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    console.log('Usando wallet admin:', walletKeypair.publicKey.toBase58());
    
    // IMPORTANTE: Usando a mesma wallet do deploy como reserva
    const YOUR_RESERVE_WALLET = walletKeypair.publicKey;
    console.log('Configurando carteira de reserva para:', YOUR_RESERVE_WALLET.toBase58());

    // Configurar o provider
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(walletKeypair), {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);

    // Carregar o programa do workspace
    const program = anchor.workspace.AdrTokenMint;
    if (!program) {
        throw new Error("Programa não encontrado no workspace Anchor. Execute 'anchor build' primeiro.");
    }
    
    console.log("ID do Programa:", program.programId.toBase58());

    try {
        // Derivar a conta de configuração como PDA
        const [configAccount] = PublicKey.findProgramAddressSync(
            [CONFIG_ACCOUNT_SEED],
            program.programId
        );
        console.log("Conta de Configuração (PDA):", configAccount.toBase58());

        // Configurar a reserva de recompensas
        console.log('Enviando transação para configurar carteira de reserva...');
        const tx = await program.methods
            .setRewardReserve(YOUR_RESERVE_WALLET)
            .accounts({
                admin: walletKeypair.publicKey,
                config: configAccount,
            })
            .rpc();

        console.log('Assinatura da transação:', tx);
        console.log(`Veja no explorador: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

        // Verificar a transação
        let verified = false;
        for (let i = 0; i < 5; i++) { // Tentar 5 vezes
            await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2 segundos entre tentativas
            verified = await verifyTransaction(connection, tx);
            if (verified) break;
        }

        if (!verified) {
            console.log('\nStatus da transação incerto. Por favor, verifique manualmente:');
            console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
            process.exit(1);
        }

        console.log('\nReserva de recompensas configurada com sucesso!');
        console.log('Agora os tokens para recompensas serão retirados da carteira:', YOUR_RESERVE_WALLET.toBase58());

        // Salvar as informações no arquivo de configuração
        const configPath = path.join(__dirname, '../config/deploy-info.json');
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                config.rewardReserveWallet = YOUR_RESERVE_WALLET.toBase58();
                config.rewardReserveConfigTimestamp = new Date().toISOString();
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                console.log('Informações da reserva salvas em config/deploy-info.json');
            } catch (error) {
                console.warn('Aviso: Não foi possível atualizar o arquivo de configuração.');
            }
        }

    } catch (error) {
        if (error.logs) {
            console.error("Logs de erro do programa:");
            console.error(error.logs.join('\n'));
        }
        
        console.error('Erro ao configurar reserva de recompensas:', error);
        process.exit(1);
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error(err);
        process.exit(1);
    }
); 