const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

async function main() {
    console.log("==== Verificando Detalhes do Projeto Anchor ====");
    
    // Verificar versão do Anchor no package.json
    try {
        const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
        console.log(`\nDependências no package.json:`);
        console.log(`- @coral-xyz/anchor: ${packageJson.dependencies['@coral-xyz/anchor'] || 'não encontrado'}`);
    } catch (error) {
        console.log(`Erro ao ler package.json: ${error.message}`);
    }
    
    // Verificar versão do Anchor.toml
    try {
        const tomlContent = fs.readFileSync('./Anchor.toml', 'utf-8');
        const anchorVersionMatch = tomlContent.match(/anchor_version\s*=\s*"([^"]+)"/);
        if (anchorVersionMatch) {
            console.log(`\nVersão no Anchor.toml: ${anchorVersionMatch[1]}`);
        }
        
        const programIdMatch = tomlContent.match(/adr_token_mint\s*=\s*"([^"]+)"/);
        if (programIdMatch) {
            console.log(`Program ID no Anchor.toml: ${programIdMatch[1]}`);
        }
    } catch (error) {
        console.log(`Erro ao ler Anchor.toml: ${error.message}`);
    }
    
    // Verificar se o programa existe
    try {
        const programIdStr = "AU11ExEVfwpRBaWgBXRKXHyHa3dAHCQsX6cEoFJxceVq";
        const programId = new PublicKey(programIdStr);
        
        const connection = new Connection(
            process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
            { commitment: 'confirmed' }
        );
        
        console.log(`\nVerificando programa na blockchain:`);
        const programInfo = await connection.getAccountInfo(programId);
        
        if (programInfo) {
            console.log(`- Programa encontrado!`);
            console.log(`  Tamanho: ${programInfo.data.length} bytes`);
            console.log(`  Proprietário: ${programInfo.owner.toString()}`);
            console.log(`  Executável: ${programInfo.executable}`);
        } else {
            console.log(`- Programa não encontrado na blockchain.`);
        }
        
        // Informações sobre o provider do Anchor
        const walletKeypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
        );
        
        console.log(`\nInformações da wallet:`);
        console.log(`- Endereço: ${walletKeypair.publicKey.toString()}`);
    } catch (error) {
        console.log(`Erro ao verificar programa: ${error.message}`);
    }
    
    // Verificar versão do Anchor em tempo de execução
    console.log(`\nVersão do Anchor em tempo de execução: ${anchor.ANCHOR_VERSION || 'não disponível'}`);
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error("Erro:", err);
        process.exit(1);
    }
); 