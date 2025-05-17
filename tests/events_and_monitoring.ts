import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import { AdrTokenMint } from "../target/types/adr_token_mint";
import { assert } from "chai";
import { TESTNET_CONFIG } from "../config/testnet";

describe("ADR Token Events and Monitoring Tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AdrTokenMint as Program<AdrTokenMint>;
  const wallet = program.provider.wallet;
  const connection = anchor.getProvider().connection;

  // Keypairs e contas
  let configAccount: Keypair;
  let paymentTokenMint: Keypair;
  let stakeAccount: Keypair;
  let payerPaymentTokenAccount: PublicKey;
  let stakerTokenAccount: PublicKey;
  let collectionMint: Keypair;
  let collectionMetadata: Keypair;
  let collectionTokenAccount: PublicKey;

  before(async () => {
    // Gerar keypairs
    configAccount = Keypair.generate();
    paymentTokenMint = Keypair.generate();
    stakeAccount = Keypair.generate();
    collectionMint = Keypair.generate();
    collectionMetadata = Keypair.generate();
    
    // Criar o token de pagamento
    await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9, // 9 decimais
      paymentTokenMint
    );
    
    // Criar conta de token para o pagador
    const paymentTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      wallet.publicKey
    );
    
    payerPaymentTokenAccount = paymentTokenAccount.address;
    
    // Criar conta de token para o staker
    const stakerAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      wallet.publicKey
    );
    
    stakerTokenAccount = stakerAccount.address;
    
    // Cunhar tokens para testes
    await mintTo(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      paymentTokenAccount.address,
      wallet.publicKey,
      20000 * 10**9 // 20000 tokens com 9 decimais
    );
    
    // Transferir alguns tokens para o staker
    await mintTo(
      connection,
      wallet.payer,
      paymentTokenMint.publicKey,
      stakerAccount.address,
      wallet.publicKey,
      1000 * 10**9 // 1000 tokens com 9 decimais
    );

    // Obter a conta de token associada para a coleção
    const { associatedProgramId, programId } = await import("@solana/spl-token");
    const ASSOCIATED_TOKEN_PROGRAM_ID = associatedProgramId;
    
    // Derivar a conta de token para a coleção
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    collectionTokenAccount = getAssociatedTokenAddressSync(
      collectionMint.publicKey,
      wallet.publicKey
    );

    // Inicializar a configuração
    await program.methods
      .initializeCollection("Test Collection", "TEST", "https://test-uri.com")
      .accounts({
        payer: wallet.publicKey,
        collectionMint: collectionMint.publicKey,
        collectionMetadata: collectionMetadata.publicKey,
        collectionTokenAccount: collectionTokenAccount,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([configAccount, collectionMint, collectionMetadata])
      .rpc();

    // Configurar o token de pagamento
    await program.methods
      .setPaymentToken(paymentTokenMint.publicKey)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
    
    // Configurar o sistema de staking
    await program.methods
      .configureStaking(true, new anchor.BN(2000)) // 20%
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Emite evento de staking corretamente", async () => {
    // Realizar um stake
    const stakeAmount = new anchor.BN(100 * 10**9); // 100 tokens
    
    const tx = await program.methods
      .stakeTokens(stakeAmount, { days7: {} })
      .accounts({
        staker: wallet.publicKey,
        tokenMint: paymentTokenMint.publicKey,
        stakerTokenAccount: stakerTokenAccount,
        stakeTokenAccount: stakerTokenAccount,
        stakeAuthority: wallet.publicKey,
        stakeAccount: stakeAccount.publicKey,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([stakeAccount])
      .rpc();
    
    // Obter o evento de staking
    const txInfo = await connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    
    // Verificar se o evento foi emitido
    assert(txInfo !== null, "Transação não encontrada");
    
    // Verificar os logs da transação
    const logs = txInfo.meta?.logMessages || [];
    const stakingEventLog = logs.find(log => 
      log.includes("StakingEvent") || 
      log.includes("Event: Staking")
    );
    
    assert(stakingEventLog !== undefined, "Evento de staking não encontrado");
    
    // Verificar se o evento contém as informações corretas
    assert(
      stakingEventLog.includes(wallet.publicKey.toBase58()) &&
      stakingEventLog.includes(stakeAmount.toString()) &&
      stakingEventLog.includes(stakeAccount.publicKey.toBase58()),
      "Evento de staking não contém as informações corretas"
    );
  });

  it("Emite evento de unstaking corretamente", async () => {
    // Simular o período de staking (avançar o tempo)
    const currentTime = Math.floor(Date.now() / 1000);
    const stakingEndTime = currentTime + (7 * 24 * 60 * 60); // 7 dias
    
    // Realizar o unstake
    const tx = await program.methods
      .unstakeTokens()
      .accounts({
        staker: wallet.publicKey,
        stakeAccount: stakeAccount.publicKey,
        tokenMint: paymentTokenMint.publicKey,
        stakerTokenAccount: stakerTokenAccount,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    // Obter o evento de unstaking
    const txInfo = await connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    
    // Verificar se o evento foi emitido
    assert(txInfo !== null, "Transação não encontrada");
    
    // Verificar os logs da transação
    const logs = txInfo.meta?.logMessages || [];
    const unstakingEventLog = logs.find(log => 
      log.includes("UnstakingEvent") || 
      log.includes("Event: Unstaking")
    );
    
    assert(unstakingEventLog !== undefined, "Evento de unstaking não encontrado");
    
    // Verificar se o evento contém as informações corretas
    assert(
      unstakingEventLog.includes(wallet.publicKey.toBase58()) &&
      unstakingEventLog.includes(stakeAccount.publicKey.toBase58()),
      "Evento de unstaking não contém as informações corretas"
    );
  });

  it("Emite evento de atualização de configuração corretamente", async () => {
    // Atualizar a configuração
    const newMaxStakeAmount = new anchor.BN(5000 * 10**9); // 5000 tokens
    
    const tx = await program.methods
      .updateMaxStakeAmount(newMaxStakeAmount)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
    
    // Obter o evento de atualização
    const txInfo = await connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    
    // Verificar se o evento foi emitido
    assert(txInfo !== null, "Transação não encontrada");
    
    // Verificar os logs da transação
    const logs = txInfo.meta?.logMessages || [];
    const configUpdateEventLog = logs.find(log => 
      log.includes("ConfigUpdateEvent") || 
      log.includes("Event: ConfigUpdate")
    );
    
    assert(configUpdateEventLog !== undefined, "Evento de atualização de configuração não encontrado");
    
    // Verificar se o evento contém as informações corretas
    assert(
      configUpdateEventLog.includes(wallet.publicKey.toBase58()) &&
      configUpdateEventLog.includes("maxStakeAmount") &&
      configUpdateEventLog.includes(newMaxStakeAmount.toString()),
      "Evento de atualização de configuração não contém as informações corretas"
    );
  });

  it("Emite evento de pausa de emergência corretamente", async () => {
    // Pausar o sistema
    const tx = await program.methods
      .setEmergencyPause(true, "Emergency pause for testing")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      } as any)
      .rpc();
    
    // Obter o evento de pausa
    const txInfo = await connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    
    // Verificar se o evento foi emitido
    assert(txInfo !== null, "Transação não encontrada");
    
    // Verificar os logs da transação
    const logs = txInfo.meta?.logMessages || [];
    const pauseEventLog = logs.find(log => 
      log.includes("EmergencyPauseEvent") || 
      log.includes("Event: EmergencyPause")
    );
    
    assert(pauseEventLog !== undefined, "Evento de pausa de emergência não encontrado");
    
    // Verificar se o evento contém as informações corretas
    assert(
      pauseEventLog.includes(wallet.publicKey.toBase58()) &&
      pauseEventLog.includes("true"),
      "Evento de pausa de emergência não contém as informações corretas"
    );
    
    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Monitora eventos em tempo real", async () => {
    // Configurar o listener de eventos
    const eventListener = connection.onLogs(
      configAccount.publicKey,
      (logs) => {
        // Verificar se o log contém um evento
        const eventLog = logs.logs.find(log => 
          log.includes("Event:") || 
          log.includes("Event")
        );
        
        if (eventLog) {
          // Verificar o tipo de evento
          if (eventLog.includes("StakingEvent")) {
            assert(
              eventLog.includes(wallet.publicKey.toBase58()),
              "Evento de staking não contém o endereço do staker"
            );
          } else if (eventLog.includes("UnstakingEvent")) {
            assert(
              eventLog.includes(wallet.publicKey.toBase58()),
              "Evento de unstaking não contém o endereço do staker"
            );
          } else if (eventLog.includes("ConfigUpdateEvent")) {
            assert(
              eventLog.includes(wallet.publicKey.toBase58()),
              "Evento de atualização de configuração não contém o endereço do admin"
            );
          } else if (eventLog.includes("EmergencyPauseEvent")) {
            assert(
              eventLog.includes(wallet.publicKey.toBase58()),
              "Evento de pausa de emergência não contém o endereço do admin"
            );
          }
        }
      },
      "confirmed"
    );
    
    // Realizar algumas ações para gerar eventos
    const stakeAmount = new anchor.BN(50 * 10**9); // 50 tokens
    
    // Stake
    await program.methods
      .stakeTokens(stakeAmount, { days7: {} })
      .accounts({
        staker: wallet.publicKey,
        tokenMint: paymentTokenMint.publicKey,
        stakerTokenAccount: stakerTokenAccount,
        stakeTokenAccount: stakerTokenAccount,
        stakeAuthority: wallet.publicKey,
        stakeAccount: stakeAccount.publicKey,
        config: configAccount.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([stakeAccount])
      .rpc();
    
    // Atualizar configuração
    await program.methods
      .updateMaxStakeAmount(new anchor.BN(3000 * 10**9)) // 3000 tokens
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
    
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
    
    // Aguardar um pouco para os eventos serem processados
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Remover o listener
    await connection.removeOnLogsListener(eventListener);
    
    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Verifica a retenção de logs", async () => {
    // Obter os logs mais recentes
    const signatures = await connection.getSignaturesForAddress(
      configAccount.publicKey,
      { limit: 10 }
    );
    
    // Verificar se há logs suficientes
    assert(signatures.length > 0, "Nenhum log encontrado");
    
    // Verificar os logs mais recentes
    for (const signature of signatures) {
      const txInfo = await connection.getTransaction(signature.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      
      if (txInfo) {
        const logs = txInfo.meta?.logMessages || [];
        
        // Verificar se os logs contêm eventos
        const eventLogs = logs.filter(log => 
          log.includes("Event:") || 
          log.includes("Event")
        );
        
        // Verificar se os eventos contêm as informações necessárias
        for (const eventLog of eventLogs) {
          assert(
            eventLog.includes(wallet.publicKey.toBase58()) ||
            eventLog.includes(configAccount.publicKey.toBase58()) ||
            eventLog.includes(stakeAccount.publicKey.toBase58()),
            "Evento não contém as informações necessárias: " + eventLog
          );
        }
      }
    }
  });

  it("Verifica o intervalo de verificação de eventos", async () => {
    // Configurar o listener de eventos com um intervalo específico
    const eventListener = connection.onLogs(
      configAccount.publicKey,
      (logs) => {
        // Verificar se o log contém um evento
        const eventLog = logs.logs.find(log => 
          log.includes("Event:") || 
          log.includes("Event")
        );
        
        if (eventLog) {
          // Verificar o timestamp do evento
          const timestamp = logs.timestamp;
          const now = Math.floor(Date.now() / 1000);
          
          // Verificar se o timestamp está dentro de um intervalo razoável
          assert(
            Math.abs(now - timestamp) <= TESTNET_CONFIG.monitoring.eventCheckInterval,
            "Timestamp do evento fora do intervalo esperado"
          );
        }
      },
      "confirmed"
    );
    
    // Realizar uma ação para gerar um evento
    await program.methods
      .updateMaxStakeAmount(new anchor.BN(4000 * 10**9)) // 4000 tokens
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
    
    // Aguardar um pouco para o evento ser processado
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Remover o listener
    await connection.removeOnLogsListener(eventListener);
  });

  it("Verifica o limite de eventos por lote", async () => {
    // Configurar o listener de eventos
    const eventListener = connection.onLogs(
      configAccount.publicKey,
      (logs) => {
        // Verificar se o número de eventos está dentro do limite
        const eventLogs = logs.logs.filter(log => 
          log.includes("Event:") || 
          log.includes("Event")
        );
        
        assert(
          eventLogs.length <= TESTNET_CONFIG.monitoring.maxEventsPerBatch,
          "Número de eventos excede o limite por lote"
        );
      },
      "confirmed"
    );
    
    // Realizar várias ações para gerar eventos
    for (let i = 0; i < TESTNET_CONFIG.monitoring.maxEventsPerBatch + 1; i++) {
      await program.methods
        .updateMaxStakeAmount(new anchor.BN((4000 + i) * 10**9)) // Incrementar o valor
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();
      
      // Aguardar um pouco entre as ações
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Aguardar um pouco para os eventos serem processados
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Remover o listener
    await connection.removeOnLogsListener(eventListener);
  });
}); 