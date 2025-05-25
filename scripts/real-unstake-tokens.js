const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// Constants
const STAKE_ACCOUNT_SEED = Buffer.from("stake_account");
const STAKE_AUTHORITY_SEED = Buffer.from("stake_authority");

async function main() {
  try {
    // Carregar stakes existentes
    const stakesPath = path.join(__dirname, '../config/stakes.json');
    if (!fs.existsSync(stakesPath)) {
      throw new Error("Nenhum stake encontrado. Execute real-stake-tokens.js primeiro.");
    }

    const stakes = JSON.parse(fs.readFileSync(stakesPath, 'utf-8'));
    if (stakes.length === 0) {
      throw new Error("Nenhum stake encontrado no arquivo de stakes.");
    }

    // Obter o stake mais recente
    const stake = stakes[stakes.length - 1];
    console.log(`Unstaking tokens do stake: ${stake.stakeAccount}`);
    console.log(`Quantidade: ${stake.amount / 10 ** 9} tokens`);
    console.log(`Período: ${stake.period} minutos`);

    // Verificar se o tempo de unlock já chegou
    const unlockTime = new Date(stake.unlockTime);
    const now = new Date();
    if (now < unlockTime && !process.argv.includes('--force')) {
      console.log(`⚠️ AVISO: O período de stake ainda não terminou!`);
      console.log(`Data/hora atual: ${now.toLocaleString()}`);
      console.log(`Disponível para unstake após: ${unlockTime.toLocaleString()}`);
      console.log(`Tempo restante: ${Math.ceil((unlockTime - now) / 1000 / 60)} minutos`);

      console.log("\nSe quiser tentar fazer unstake mesmo assim, execute o script com a flag --force");
      process.exit(1);
    }

    if (now < unlockTime) {
      console.log("\n⚠️ Flag --force detectada. Tentando fazer unstake antes do período...");
    }

    // Setup da conexão com a Devnet
    const connection = new Connection(
      process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
      { commitment: 'confirmed' }
    );
    console.log("\nConectado à", connection.rpcEndpoint);

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
      throw new Error("Arquivo de configuração não encontrado.");
    }

    if (fs.existsSync(deployInfoPath)) {
      deployInfo = JSON.parse(fs.readFileSync(deployInfoPath, 'utf-8'));
    }

    // Obter informações necessárias
    const tokenMint = new PublicKey(deployInfo.paymentTokenMint || config.paymentTokenMint);
    const configAccount = new PublicKey(config.configAccount);
    const stakeAccount = new PublicKey(stake.stakeAccount);

    console.log("Token Mint:", tokenMint.toBase58());
    console.log("Config Account:", configAccount.toBase58());
    console.log("Stake Account:", stakeAccount.toBase58());

    // Derivar PDA para autoridade de stake
    const [stakeAuthority] = PublicKey.findProgramAddressSync(
      [STAKE_AUTHORITY_SEED],
      program.programId
    );
    console.log("Stake Authority PDA:", stakeAuthority.toBase58());

    // Obter a conta de token do staker
    const stakerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      walletKeypair.publicKey
    );
    console.log("Staker Token Account:", stakerTokenAccount.toBase58());

    // Obter a conta de token do stake
    const stakeTokenAccount = new PublicKey(stake.stakeTokenAccount);
    console.log("Stake Token Account:", stakeTokenAccount.toBase58());

    // Encontrar a reserva de recompensas na configuração ou usar padrão
    let rewardReserveAccount;
    if (config.rewardReserveAccount) {
      rewardReserveAccount = new PublicKey(config.rewardReserveAccount);
    } else {
      // Usar o tokenAccount da conta de configuração
      rewardReserveAccount = await getAssociatedTokenAddress(
        tokenMint,
        configAccount,
        true // allowOwnerOffCurve = true
      );
    }

    console.log("Reward Reserve Account:", rewardReserveAccount.toBase58());

    // TEMPORÁRIO: Verificar o saldo nas contas
    try {
      const stakeTokBalance = await connection.getTokenAccountBalance(stakeTokenAccount);
      console.log(`Saldo na conta de stake: ${stakeTokBalance.value.uiAmount} tokens`);

      const stakerTokBalance = await connection.getTokenAccountBalance(stakerTokenAccount);
      console.log(`Saldo na sua conta: ${stakerTokBalance.value.uiAmount} tokens`);
    } catch (e) {
      console.log("Erro ao verificar saldos:", e.message);
    }

    // Realizar o unstake
    console.log("\nEnviando transação de unstake...");
    try {
      const tx = await program.methods
        .unstakeTokens()
        .accounts({
          staker: walletKeypair.publicKey,
          tokenMint: tokenMint,
          stakerTokenAccount: stakerTokenAccount,
          stakeTokenAccount: stakeTokenAccount,
          rewardReserveAccount: stakeTokenAccount,
          stakeAuthority: stakeAuthority,
          stakeAccount: stakeAccount,
          config: configAccount,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      console.log("Transação enviada:", tx);
      console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

      // Atualizar o arquivo de stakes
      stake.unstaked = true;
      stake.unstakeTime = new Date().toISOString();
      stake.unstakeTx = tx;

      fs.writeFileSync(stakesPath, JSON.stringify(stakes, null, 2));
      console.log("\nInformações do unstake atualizadas em config/stakes.json");

      // Recomendar verificar o saldo
      console.log("\n✅ Unstake realizado com sucesso!");
      console.log("Sugestão: Verifique seu saldo de tokens para confirmar que recebeu os tokens + recompensas");
    } catch (error) {
      if (error.logs) {
        console.error("Logs de erro do programa:");
        console.error(error.logs.join('\n'));
      }
      console.error("Erro ao fazer unstake:", error);

      // PLANO B: Tentar fazendo bypass
      console.log("\n⚠️ Tentando unstake alternativo...");
      try {
        // Verificar se há uma conta de reserva válida e tentar configurá-la
        if (config.rewardReserveAccount) {
          console.log("Usando reserva existente:", config.rewardReserveAccount);
        } else {
          console.log("Configurando reserva para usar a conta de stake...");
          // Tentar configurar a reserva para usar a mesma conta de stake
          const txSetReserve = await program.methods
            .setRewardReserve(stakeTokenAccount)
            .accounts({
              admin: walletKeypair.publicKey,
              config: configAccount,
            })
            .rpc();

          console.log("Reserva configurada:", txSetReserve);

          // Atualizar configuração
          config.rewardReserveAccount = stakeTokenAccount.toBase58();
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

          // Tentar novamente o unstake
          console.log("Tentando unstake novamente...");
          const tx = await program.methods
            .unstakeTokens()
            .accounts({
              staker: walletKeypair.publicKey,
              tokenMint: tokenMint,
              stakerTokenAccount: stakerTokenAccount,
              stakeTokenAccount: stakeTokenAccount,
              rewardReserveAccount: stakeTokenAccount,
              stakeAuthority: stakeAuthority,
              stakeAccount: stakeAccount,
              config: configAccount,
              tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

          console.log("Transação enviada:", tx);
          console.log(`Veja em: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

          // Atualizar o arquivo de stakes
          stake.unstaked = true;
          stake.unstakeTime = new Date().toISOString();
          stake.unstakeTx = tx;

          fs.writeFileSync(stakesPath, JSON.stringify(stakes, null, 2));
          console.log("\nInformações do unstake atualizadas em config/stakes.json");

          console.log("\n✅ Unstake alternativo realizado com sucesso!");
        }
      } catch (altError) {
        console.error("Erro no unstake alternativo:", altError);
        if (altError.logs) {
          console.error(altError.logs.join('\n'));
        }
        throw new Error("Não foi possível fazer unstake pelos métodos padrão. Use scripts/emergency-unstake.js para tentar um resgate de emergência.");
      }
    }

  } catch (error) {
    console.error("Erro ao fazer unstake:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  }); 