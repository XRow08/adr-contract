const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
    // Quantidade a transferir
    const amount = 1000000 * 10 ** 9; // 10 tokens

    console.log(`Transferindo ${amount} tokens para sua carteira...`);

    try {
        // Setup da conexão com a Devnet
        const connection = new Connection(
            process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
            { commitment: 'confirmed' }
        );
        console.log("Conectado à", connection.rpcEndpoint);

        // Carregar a wallet do admin (neste caso, a mesma do destinatário)
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
        }

        if (fs.existsSync(deployInfoPath)) {
            deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
        }

        if (Object.keys(config).length === 0 && Object.keys(deployInfo).length === 0) {
            throw new Error("Nenhum arquivo de configuração encontrado.");
        }

        // Obter informações necessárias
        const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint || "2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
        console.log("Token Mint:", tokenMint.toBase58());

        // Tentar encontrar uma conta que tenha tokens para transferir
        console.log("Procurando reserva com tokens...");

        let sourceTokenAccount;

        // Obter o programId
        const programId = new PublicKey(deployInfo.programId || config.programId || "65zQjC4UYf4zJdDyfScpZjgaBbiMRpmFhNJkFSp39GZF");

        // Derivar o PDA para autoridade de stake
        const [stakeAuthority] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake_authority")],
            programId
        );

        // Opção 1: Usar a reserva de recompensas se estiver configurada
        if (config.rewardReserveAccount) {
            sourceTokenAccount = new PublicKey(config.rewardReserveAccount);
            console.log("Usando reserva de recompensas:", sourceTokenAccount.toBase58());

            // Verificar saldo
            try {
                const balance = await connection.getTokenAccountBalance(sourceTokenAccount);
                console.log(`Saldo da reserva: ${balance.value.uiAmount} tokens`);

                if (Number(balance.value.amount) < amount) {
                    console.log("⚠️ Saldo insuficiente na reserva. Buscando alternativa...");
                    sourceTokenAccount = null;
                }
            } catch (error) {
                console.log("⚠️ Erro ao verificar reserva:", error.message);
                sourceTokenAccount = null;
            }
        }

        // Se não encontrou uma conta com tokens, cria um novo token
        if (!sourceTokenAccount) {
            throw new Error("Não foi possível encontrar uma conta com tokens para transferir. Execute deposit-rewards.js para adicionar tokens à reserva.");
        }

        // Criar conta de token do destinatário se não existir
        const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            walletKeypair,
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Conta de token do destinatário:", recipientTokenAccount.address.toBase58());

        // Verificar saldo atual
        const initialBalance = await connection.getTokenAccountBalance(recipientTokenAccount.address);
        console.log(`Saldo atual: ${initialBalance.value.uiAmount} tokens`);

        // Fazer a transferência
        console.log("\nTransferindo tokens...");

        // Usar a conta de configuração do arquivo config em vez de derivá-la
        const configAccount = new PublicKey(config.configAccount);
        console.log("Config Account:", configAccount.toBase58());

        // Configurar o provider
        const provider = new anchor.AnchorProvider(
            connection,
            new anchor.Wallet(walletKeypair),
            { commitment: 'confirmed' }
        );
        anchor.setProvider(provider);

        // Carregar o programa do workspace
        const program = anchor.workspace.AdrTokenMint;

        // Chamar a função de depósito no contrato, mas com um valor negativo para sacar
        const tx = await program.methods
            .depositRewardReserve(new anchor.BN(amount))
            .accounts({
                admin: walletKeypair.publicKey,
                adminTokenAccount: recipientTokenAccount.address,
                rewardReserveAccount: sourceTokenAccount,
                tokenMint: tokenMint,
                stakeAuthority: stakeAuthority,
                config: configAccount,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
            })
            .rpc();

        console.log("Transação enviada:", tx);
        console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

        // Verificar novo saldo
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar confirmação
            const newBalance = await connection.getTokenAccountBalance(recipientTokenAccount.address);
            console.log(`\nNovo saldo: ${newBalance.value.uiAmount} tokens`);

            const diff = newBalance.value.uiAmount - initialBalance.value.uiAmount;
            console.log(`Tokens recebidos: ${diff}`);
        } catch (error) {
            console.warn("⚠️ Erro ao verificar novo saldo:", error.message);
        }

        console.log("\n✅ Transferência concluída!");
        console.log("Agora você pode fazer stake dos seus tokens com o script real-stake-tokens.js");

    } catch (error) {
        if (error.logs) {
            console.error("Logs de erro do programa:");
            console.error(error.logs.join('\n'));
        }
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