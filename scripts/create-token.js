const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Carregar wallet do arquivo
    const walletKeypair = Keypair.fromSecretKey(
      Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
    );
    console.log(`Usando wallet: ${walletKeypair.publicKey.toBase58()}`);

    // Conectar à Solana devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    console.log(`Conectado a ${connection.rpcEndpoint}`);

    // Criar o token com 9 casas decimais (padrão para tokens SPL)
    console.log('Criando token de pagamento...');
    const decimals = 9;
    const tokenMint = await createMint(
      connection,
      walletKeypair,
      walletKeypair.publicKey,
      walletKeypair.publicKey,
      decimals
    );
    console.log(`Token mint criado: ${tokenMint.toBase58()}`);

    // Criar conta associada para o token
    console.log('Criando conta associada para o token...');
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      walletKeypair,
      tokenMint,
      walletKeypair.publicKey
    );
    console.log(`Conta associada criada: ${tokenAccount.address.toBase58()}`);

    // Mintar 1000 tokens para testes
    const amount = 1000 * 10**decimals; // 1000 tokens com 9 casas decimais
    console.log(`Mintando ${amount / 10**decimals} tokens para testes...`);
    await mintTo(
      connection,
      walletKeypair,
      tokenMint,
      tokenAccount.address,
      walletKeypair.publicKey,
      amount
    );
    console.log(`Tokens mintados com sucesso!`);

    // Atualizar arquivo de configuração
    const configPath = path.join(__dirname, '../config/deploy-info.json');
    let config = {};
    
    // Verificar se o arquivo existe
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch (error) {
        console.warn('Aviso: Não foi possível ler o arquivo de configuração existente.');
      }
    } else {
      // Criar diretório config se não existir
      if (!fs.existsSync(path.join(__dirname, '../config'))) {
        fs.mkdirSync(path.join(__dirname, '../config'));
      }
    }
    
    // Atualizar com informações do novo token
    config.paymentTokenMint = tokenMint.toBase58();
    config.paymentTokenAccount = tokenAccount.address.toBase58();
    config.paymentTokenDecimals = decimals;
    config.tokenCreationTimestamp = new Date().toISOString();
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('Informações do token salvas em config/deploy-info.json');

    return tokenMint.toBase58();
  } catch (error) {
    console.error('Erro ao criar token:', error);
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