const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Constants
const CONFIG_ACCOUNT_SEED = Buffer.from("config");
const NFT_COUNTER_SEED = Buffer.from("nft_counter");
const STAKE_AUTHORITY_SEED = Buffer.from("stake_authority");

async function main() {
    console.log("==== Verificando Status do Deploy ADR Token Mint ====\n");

    // Carregar configurações
    const deployInfoPath = path.join(__dirname, '../config/deploy-info.json');
    let deployInfo = {};
    
    if (fs.existsSync(deployInfoPath)) {
        try {
            deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
            console.log("✅ Arquivo de configuração encontrado");
        } catch (error) {
            console.log("❌ Erro ao ler arquivo de configuração:", error.message);
            process.exit(1);
        }
    } else {
        console.log("❌ Arquivo de configuração não encontrado");
        process.exit(1);
    }

    // Informações básicas
    console.log("\n📋 Informações do deploy:");
    console.log(`- Program ID: ${deployInfo.programId || 'Não configurado'}`);
    console.log(`- Token de pagamento: ${deployInfo.paymentTokenMint || 'Não configurado'}`);
    console.log(`- Data do deploy: ${deployInfo.deployTimestamp || 'Não registrada'}`);
    
    if (deployInfo.collectionMint) {
        console.log(`- Coleção NFT: ${deployInfo.collectionName || 'Sem nome'} (${deployInfo.collectionMint})`);
    } else {
        console.log(`- Coleção NFT: Não inicializada`);
    }

    // Configurar conexão com a Devnet
    const connection = new Connection(
        process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
        { commitment: 'confirmed' }
    );
    console.log(`\n🔌 Conectado a ${connection.rpcEndpoint}`);

    // Verificar se o programa existe na blockchain
    if (deployInfo.programId) {
        try {
            const programId = new PublicKey(deployInfo.programId);
            const programInfo = await connection.getAccountInfo(programId);
            
            if (programInfo) {
                console.log(`✅ Programa encontrado na blockchain`);
                console.log(`  - Tamanho: ${programInfo.data.length} bytes`);
                console.log(`  - Proprietário: ${programInfo.owner.toString()}`);
                console.log(`  - Executável: ${programInfo.executable}`);
            } else {
                console.log(`❌ Programa NÃO encontrado na blockchain`);
            }
        } catch (error) {
            console.log(`❌ Erro ao verificar programa: ${error.message}`);
        }
    }

    // Carregar wallet para derivar PDAs
    let wallet;
    try {
        const walletKeypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
        );
        wallet = walletKeypair.publicKey;
        console.log(`\n👛 Wallet: ${wallet.toString()}`);
    } catch (error) {
        console.log(`❌ Erro ao carregar wallet: ${error.message}`);
        process.exit(1);
    }

    // Verificar PDAs
    if (deployInfo.programId) {
        const programId = new PublicKey(deployInfo.programId);
        
        // Config account
        const [configAccount] = PublicKey.findProgramAddressSync(
            [CONFIG_ACCOUNT_SEED],
            programId
        );
        console.log(`\n🔍 Verificando contas PDA:`);
        console.log(`- Config Account: ${configAccount.toString()}`);
        
        try {
            const configInfo = await connection.getAccountInfo(configAccount);
            if (configInfo) {
                console.log(`  ✅ Conta de configuração inicializada (${configInfo.data.length} bytes)`);
            } else {
                console.log(`  ❌ Conta de configuração NÃO inicializada`);
            }
        } catch (error) {
            console.log(`  ❌ Erro ao verificar conta de configuração: ${error.message}`);
        }
        
        // NFT Counter
        const [nftCounter] = PublicKey.findProgramAddressSync(
            [NFT_COUNTER_SEED],
            programId
        );
        console.log(`- NFT Counter: ${nftCounter.toString()}`);
        
        try {
            const nftCounterInfo = await connection.getAccountInfo(nftCounter);
            if (nftCounterInfo) {
                console.log(`  ✅ Contador de NFT inicializado (${nftCounterInfo.data.length} bytes)`);
            } else {
                console.log(`  ❌ Contador de NFT NÃO inicializado`);
            }
        } catch (error) {
            console.log(`  ❌ Erro ao verificar contador de NFT: ${error.message}`);
        }
        
        // Stake Authority
        const [stakeAuthority] = PublicKey.findProgramAddressSync(
            [STAKE_AUTHORITY_SEED],
            programId
        );
        console.log(`- Stake Authority: ${stakeAuthority.toString()}`);
    }

    // Verificar token de pagamento
    if (deployInfo.paymentTokenMint) {
        try {
            const tokenMint = new PublicKey(deployInfo.paymentTokenMint);
            const tokenInfo = await connection.getAccountInfo(tokenMint);
            
            console.log(`\n💰 Verificando token de pagamento:`);
            if (tokenInfo) {
                console.log(`  ✅ Token encontrado na blockchain`);
                
                // Verificar se a wallet possui uma conta para este token
                const tokenAccount = await getAssociatedTokenAddress(
                    tokenMint,
                    wallet
                );
                
                try {
                    const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
                    if (tokenAccountInfo) {
                        console.log(`  ✅ Conta de token associada encontrada: ${tokenAccount.toString()}`);
                    } else {
                        console.log(`  ❌ Conta de token associada NÃO encontrada`);
                    }
                } catch (error) {
                    console.log(`  ❌ Erro ao verificar conta de token: ${error.message}`);
                }
            } else {
                console.log(`  ❌ Token NÃO encontrado na blockchain`);
            }
        } catch (error) {
            console.log(`  ❌ Erro ao verificar token: ${error.message}`);
        }
    }

    // Verificar reserva de recompensas
    if (deployInfo.rewardReserveAccount) {
        try {
            const reserveAccount = new PublicKey(deployInfo.rewardReserveAccount);
            console.log(`\n🏦 Verificando reserva de recompensas:`);
            console.log(`- Conta: ${reserveAccount.toString()}`);
            
            const reserveInfo = await connection.getAccountInfo(reserveAccount);
            if (reserveInfo) {
                console.log(`  ✅ Conta de reserva encontrada`);
                
                try {
                    const balance = await connection.getTokenAccountBalance(reserveAccount);
                    console.log(`  💰 Saldo: ${balance.value.uiAmount} tokens`);
                } catch (error) {
                    console.log(`  ❌ Erro ao obter saldo: ${error.message}`);
                }
            } else {
                console.log(`  ❌ Conta de reserva NÃO encontrada`);
            }
        } catch (error) {
            console.log(`  ❌ Erro ao verificar reserva: ${error.message}`);
        }
    } else {
        console.log(`\n🏦 Reserva de recompensas: Não configurada`);
    }

    // Verificar configurações de staking
    console.log(`\n⏱️ Configurações de staking:`);
    if (deployInfo.stakingEnabled !== undefined) {
        console.log(`- Staking habilitado: ${deployInfo.stakingEnabled ? 'Sim' : 'Não'}`);
        if (deployInfo.stakingRewardRate !== undefined) {
            console.log(`- Taxa de recompensa: ${deployInfo.stakingRewardRate / 100}%`);
        } else {
            console.log(`- Taxa de recompensa: Não configurada`);
        }
    } else {
        console.log(`- Staking não configurado`);
    }

    // Verificar se há stakes ativos
    const stakesPath = path.join(__dirname, '../config/stakes.json');
    if (fs.existsSync(stakesPath)) {
        try {
            const stakes = JSON.parse(fs.readFileSync(stakesPath, 'utf-8'));
            console.log(`\n📊 Stakes registrados: ${stakes.length}`);
            
            let activeStakes = 0;
            let completedStakes = 0;
            
            for (const stake of stakes) {
                if (stake.unstaked) {
                    completedStakes++;
                } else {
                    activeStakes++;
                }
            }
            
            console.log(`- Stakes ativos: ${activeStakes}`);
            console.log(`- Stakes concluídos: ${completedStakes}`);
        } catch (error) {
            console.log(`❌ Erro ao ler arquivo de stakes: ${error.message}`);
        }
    } else {
        console.log(`\n📊 Nenhum stake registrado`);
    }

    console.log("\n==== Verificação Concluída ====");
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Erro durante a verificação:", err);
        process.exit(1);
    }
); 