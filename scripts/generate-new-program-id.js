const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

function main() {
    console.log("==== Gerando novo ID de programa ====\n");

    // Gerar novo par de chaves
    const newProgramKeypair = Keypair.generate();
    const newProgramId = newProgramKeypair.publicKey.toString();
    console.log(`Novo ID de programa: ${newProgramId}`);

    // Salvar o keypair
    const targetDir = path.join(__dirname, '../target/deploy');
    const keyfilePath = path.join(targetDir, 'adr_token_mint-keypair.json');
    
    // Criar diretório se não existir
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Salvar em formato de array de números
    const secretKeyArray = Array.from(newProgramKeypair.secretKey);
    fs.writeFileSync(keyfilePath, JSON.stringify(secretKeyArray));
    console.log(`Keypair salvo em: ${keyfilePath}`);
    
    // Gerar instruções para atualizar os arquivos
    console.log("\n==== Instruções para atualizar os arquivos ====");
    console.log("1. Atualize o ID no arquivo lib.rs:");
    console.log(`   declare_id!("${newProgramId}");`);
    console.log("\n2. Atualize o ID no arquivo Anchor.toml:");
    console.log(`   adr_token_mint = "${newProgramId}"`);
    console.log("\n3. Reconstrua e reimplante o programa:");
    console.log("   anchor build");
    console.log("   anchor deploy");
}

main(); 