const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function main() {
	// Parâmetros de configuração do staking
	const stakingEnabled = true;
	const rewardRate = 500; // 5% (500 / 10000)
	
	console.log(`Configurando sistema de staking: enabled=${stakingEnabled}, rewardRate=${rewardRate/100}%`);

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
		
		let config = {};
		
		if (fs.existsSync(configPath)) {
			config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
		} else {
			throw new Error("Arquivo de configuração não encontrado. Execute initialize-collection.js primeiro.");
		}
		
		// Obter informações necessárias
		const configAccount = new PublicKey(config.configAccount);
		console.log("Config Account:", configAccount.toBase58());
		
		// Verificar se a reserva foi inicializada
		if (!config.rewardReserveAccount) {
			throw new Error("Reserva de recompensas não inicializada. Execute initialize-reward-reserve.js primeiro.");
		}
		
		// Configurar o staking
		console.log(`\nEnviando transação para configurar o staking...`);
		const tx = await program.methods
			.configureStaking(stakingEnabled, new anchor.BN(rewardRate))
			.accounts({
				admin: walletKeypair.publicKey,
				config: configAccount,
			})
			.rpc();
		
		console.log("Transação enviada:", tx);
		console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
		
		// Atualizar o arquivo de configuração
		config.stakingEnabled = stakingEnabled;
		config.stakingRewardRate = rewardRate;
		config.stakingConfigTime = new Date().toISOString();
		
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		console.log("\nInformações do staking salvas em config/deploy-config.json");
		
		console.log("\n✅ Staking configurado com sucesso!");
		console.log(`O staking está ${stakingEnabled ? 'ativado' : 'desativado'} com taxa de recompensa de ${rewardRate/100}%`);
		console.log("Próximo passo: Teste o staking com o script real-stake-tokens.js");
		
	} catch (error) {
		if (error.logs) {
			console.error("Logs de erro do programa:");
			console.error(error.logs.join('\n'));
		}
		console.error("Erro ao configurar staking:", error);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err);
		process.exit(1);
	});