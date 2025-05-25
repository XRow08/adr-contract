const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Constants
const CONFIG_ACCOUNT_SEED = Buffer.from("config");
const STAKE_AUTHORITY_SEED = Buffer.from("stake_authority");
const NFT_COUNTER_SEED = Buffer.from("nft_counter");

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCommand(command, description) {
    console.log(`\n🔄 ${description}...`);
    try {
        const output = execSync(command, { encoding: 'utf8' });
        console.log(`✅ Comando concluído com sucesso.`);
        return output;
    } catch (error) {
        console.log(`❌ Erro ao executar comando: ${error.message}`);
        return null;
    }
}

async function main() {
    console.log("\n==== Configurando Todos os Componentes do ADR Token Mint ====\n");

    // 1. Verificar se a carteira existe
    console.log("👛 Verificando carteira...");
    if (!fs.existsSync('./wallet-dev.json')) {
        console.log("❌ Carteira não encontrada. Por favor, crie uma wallet-dev.json antes de prosseguir.");
        process.exit(1);
    }
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    const wallet = walletKeypair.publicKey;
    console.log(`✅ Usando wallet: ${wallet.toString()}`);

    // 2. Configurar conexão com a rede
    const connection = new Connection(
        process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
        { commitment: 'confirmed' }
    );
    console.log(`🔌 Conectado a ${connection.rpcEndpoint}`);

    // 3. Verificar saldo da carteira
    try {
        const balance = await connection.getBalance(wallet);
        console.log(`💰 Saldo da carteira: ${balance / 10**9} SOL`);
        
        if (balance < 0.5 * 10**9) {
            console.log("⚠️ Saldo baixo. Solicitando airdrop...");
            const signature = await connection.requestAirdrop(wallet, 1 * 10**9);
            await connection.confirmTransaction(signature);
            const newBalance = await connection.getBalance(wallet);
            console.log(`✅ Novo saldo: ${newBalance / 10**9} SOL`);
        }
    } catch (error) {
        console.log(`❌ Erro ao verificar saldo: ${error.message}`);
    }

    // 4. Verificar se o programa já está implantado
    const deployInfoPath = path.join(__dirname, '../config/deploy-info.json');
    let deployInfo = {};
    let needsDeployment = false;
    
    if (fs.existsSync(deployInfoPath)) {
        try {
            deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
            if (deployInfo.programId) {
                console.log(`📋 Programa já implantado: ${deployInfo.programId}`);
                
                // Verificar se o programa existe na blockchain
                try {
                    const programId = new PublicKey(deployInfo.programId);
                    const programInfo = await connection.getAccountInfo(programId);
                    
                    if (programInfo) {
                        console.log(`✅ Programa encontrado na blockchain`);
                    } else {
                        console.log(`❌ Programa NÃO encontrado na blockchain. Precisará ser reimplantado.`);
                        needsDeployment = true;
                    }
                } catch (error) {
                    console.log(`❌ Erro ao verificar programa: ${error.message}`);
                    needsDeployment = true;
                }
            } else {
                console.log("⚠️ ID do programa não encontrado no arquivo de configuração.");
                needsDeployment = true;
            }
        } catch (error) {
            console.log(`❌ Erro ao ler arquivo de configuração: ${error.message}`);
            needsDeployment = true;
        }
    } else {
        console.log("⚠️ Arquivo de configuração não encontrado.");
        needsDeployment = true;
    }

    // 5. Compilar o programa
    await runCommand("anchor build", "Compilando o programa");

    // 6. Implantar o programa se necessário
    if (needsDeployment) {
        console.log("\n🚀 Implantando o programa...");
        await runCommand("anchor deploy", "Implantando o programa");
        
        // Verificar o ID do programa do Anchor.toml
        try {
            const tomlContent = fs.readFileSync('./Anchor.toml', 'utf8');
            const programIdMatch = tomlContent.match(/adr_token_mint\s*=\s*"([^"]+)"/);
            if (programIdMatch && programIdMatch[1]) {
                const programId = programIdMatch[1];
                
                // Atualizar ou criar arquivo de configuração
                deployInfo = {
                    ...deployInfo,
                    programId: programId,
                    deployTimestamp: new Date().toISOString()
                };
                
                // Criar diretório config se não existir
                if (!fs.existsSync('./config')) {
                    fs.mkdirSync('./config');
                }
                
                fs.writeFileSync(deployInfoPath, JSON.stringify(deployInfo, null, 2));
                console.log(`✅ ID do programa atualizado: ${programId}`);
            } else {
                console.log("❌ Não foi possível encontrar o ID do programa no Anchor.toml");
                process.exit(1);
            }
        } catch (error) {
            console.log(`❌ Erro ao atualizar ID do programa: ${error.message}`);
            process.exit(1);
        }
    }

    // Configurar provider para usar o programa
    const provider = new anchor.AnchorProvider(
        connection, 
        new anchor.Wallet(walletKeypair),
        { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);
    
    // Carregar o programa
    const program = anchor.workspace.AdrTokenMint;
    if (!program) {
        console.log("❌ Não foi possível carregar o programa do workspace.");
        process.exit(1);
    }
    
    const programId = new PublicKey(deployInfo.programId);
    console.log(`📋 Usando Program ID: ${programId.toString()}`);

    // 7. Verificar e configurar token de pagamento
    console.log("\n💲 Verificando token de pagamento...");
    let tokenMint;
    
    if (deployInfo.paymentTokenMint) {
        tokenMint = new PublicKey(deployInfo.paymentTokenMint);
        console.log(`✅ Token de pagamento já configurado: ${tokenMint.toString()}`);
        
        // Verificar se o token existe
        try {
            const tokenInfo = await connection.getAccountInfo(tokenMint);
            if (!tokenInfo) {
                console.log("❌ Token não encontrado na blockchain. Criando um novo token...");
                const result = await runCommand("node scripts/create-token.js", "Criando novo token");
                
                // Extrair o endereço do token do resultado
                if (result) {
                    const tokenMatch = result.match(/Token mint criado:\s+(\w+)/);
                    if (tokenMatch && tokenMatch[1]) {
                        tokenMint = new PublicKey(tokenMatch[1]);
                        deployInfo.paymentTokenMint = tokenMint.toString();
                        fs.writeFileSync(deployInfoPath, JSON.stringify(deployInfo, null, 2));
                        console.log(`✅ Novo token criado: ${tokenMint.toString()}`);
                    }
                }
            }
        } catch (error) {
            console.log(`❌ Erro ao verificar token: ${error.message}`);
        }
    } else {
        console.log("⚠️ Token de pagamento não configurado. Criando um novo token...");
        const result = await runCommand("node scripts/create-token.js", "Criando novo token");
        
        // Extrair o endereço do token do resultado
        if (result) {
            const tokenMatch = result.match(/Token mint criado:\s+(\w+)/);
            if (tokenMatch && tokenMatch[1]) {
                tokenMint = new PublicKey(tokenMatch[1]);
                deployInfo.paymentTokenMint = tokenMint.toString();
                fs.writeFileSync(deployInfoPath, JSON.stringify(deployInfo, null, 2));
                console.log(`✅ Novo token criado: ${tokenMint.toString()}`);
            }
        }
    }

    // 8. Configurar o token de pagamento no programa
    console.log("\n⚙️ Configurando token de pagamento no programa...");
    try {
        // Derivar a conta de configuração como PDA
        const [configAccount] = PublicKey.findProgramAddressSync(
            [CONFIG_ACCOUNT_SEED],
            programId
        );
        
        // Verificar se a conta de configuração já existe
        let configInfo;
        try {
            configInfo = await connection.getAccountInfo(configAccount);
        } catch (error) {
            console.log(`⚠️ Erro ao verificar conta de configuração: ${error.message}`);
        }
        
        if (!configInfo) {
            console.log("⚠️ Conta de configuração não inicializada. Inicializando coleção NFT...");
            
            // Inicializar coleção NFT (que também inicializa a conta de configuração)
            await runCommand("node scripts/test-initialize-collection.js", "Inicializando coleção NFT");
            await sleep(2000); // Esperar um pouco para a transação ser processada
            
            // Tentar novamente para verificar
            try {
                configInfo = await connection.getAccountInfo(configAccount);
                if (configInfo) {
                    console.log("✅ Conta de configuração inicializada com sucesso.");
                } else {
                    console.log("❌ Falha ao inicializar conta de configuração.");
                    process.exit(1);
                }
            } catch (error) {
                console.log(`❌ Erro ao verificar conta de configuração: ${error.message}`);
                process.exit(1);
            }
        }
        
        // Configurar o token de pagamento
        console.log("🔄 Configurando token de pagamento...");
        try {
            const tx = await program.methods
                .setPaymentToken(tokenMint)
                .accounts({
                    admin: wallet,
                    config: configAccount,
                })
                .rpc();
            console.log(`✅ Token de pagamento configurado. Transação: ${tx}`);
        } catch (error) {
            console.log(`⚠️ Não foi possível configurar o token de pagamento diretamente: ${error.message}`);
            console.log("🔄 Tentando com script alternativo...");
            
            // Criar arquivo temporário com token configurado
            const tempScriptPath = path.join(__dirname, 'temp-set-token.js');
            const scriptContent = `
const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

async function main() {
    const connection = new Connection(
        process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
        { commitment: 'confirmed' }
    );
    
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    
    const provider = new anchor.AnchorProvider(
        connection, 
        new anchor.Wallet(walletKeypair),
        { commitment: 'confirmed' }
    );
    anchor.setProvider(provider);
    
    const program = anchor.workspace.AdrTokenMint;
    const programId = new PublicKey("${deployInfo.programId}");
    const tokenMint = new PublicKey("${tokenMint.toString()}");
    
    const [configAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        programId
    );
    
    try {
        const tx = await program.methods
            .setPaymentToken(tokenMint)
            .accounts({
                admin: walletKeypair.publicKey,
                config: configAccount,
            })
            .rpc();
        console.log(\`Token configurado: \${tx}\`);
    } catch (error) {
        console.error(error);
    }
}

main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
`;
            
            fs.writeFileSync(tempScriptPath, scriptContent);
            await runCommand(`node ${tempScriptPath}`, "Configurando token de pagamento (alternativo)");
            
            // Limpar arquivo temporário
            try {
                fs.unlinkSync(tempScriptPath);
            } catch (e) {
                console.log(`⚠️ Não foi possível excluir arquivo temporário: ${e.message}`);
            }
        }
    } catch (error) {
        console.log(`❌ Erro ao configurar token de pagamento: ${error.message}`);
    }

    // 9. Configurar reserva de recompensas
    console.log("\n🏦 Configurando reserva de recompensas...");
    try {
        // Derivar autoridade de stake
        const [stakeAuthority] = PublicKey.findProgramAddressSync(
            [STAKE_AUTHORITY_SEED],
            programId
        );
        
        // Inicializar reserva de recompensas
        await runCommand("node scripts/initialize-reward-reserve.js", "Inicializando reserva de recompensas");
        
        // Depositar tokens na reserva
        await runCommand("node scripts/deposit-rewards.js", "Depositando tokens na reserva de recompensas");
    } catch (error) {
        console.log(`❌ Erro ao configurar reserva de recompensas: ${error.message}`);
    }

    // 10. Configurar staking
    console.log("\n⏱️ Configurando sistema de staking...");
    await runCommand("node scripts/configure-staking.js", "Configurando staking");

    // 11. Verificar o status final
    console.log("\n🔍 Verificando status final da configuração...");
    await runCommand("node scripts/check-deployment-status.js", "Verificando status");

    console.log("\n✅ Configuração completa! O sistema está pronto para uso.");
    console.log("Para testar o sistema de staking, execute os seguintes comandos:");
    console.log("1. node scripts/test-stake-tokens.js");
    console.log("2. Aguarde o período de staking terminar");
    console.log("3. node scripts/test-unstake-tokens.js");
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Erro durante a configuração:", err);
        process.exit(1);
    }
); 