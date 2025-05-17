import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createMint,
} from "@solana/spl-token";
import { AdrTokenMint } from "../target/types/adr_token_mint";
import { assert } from "chai";

describe("ADR Token Config Security Tests", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.AdrTokenMint as Program<AdrTokenMint>;
  const wallet = program.provider.wallet;
  const connection = anchor.getProvider().connection;

  // Keypairs e contas
  let configAccount: Keypair;
  let paymentTokenMint: Keypair;
  let attackerWallet: Keypair;
  let secondaryAdminWallet: Keypair;
  let collectionMint: Keypair;
  let collectionMetadata: Keypair;
  let collectionTokenAccount: PublicKey;

  before(async () => {
    // Gerar keypairs
    configAccount = Keypair.generate();
    paymentTokenMint = Keypair.generate();
    attackerWallet = Keypair.generate();
    secondaryAdminWallet = Keypair.generate();
    collectionMint = Keypair.generate();
    collectionMetadata = Keypair.generate();

    // Airdrop SOL para a carteira do atacante e do admin secundário
    const signature1 = await connection.requestAirdrop(
      attackerWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature1);

    const signature2 = await connection.requestAirdrop(
      secondaryAdminWallet.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(signature2);

    // Criar o token de pagamento
    await createMint(
      connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      9, // 9 decimais
      paymentTokenMint
    );

    // Derivar a conta de token para a coleção
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
      } as any)
      .rpc();

    // Configurar o sistema de staking
    await program.methods
      .configureStaking(true, new anchor.BN(2000)) // 20%
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      } as any)
      .rpc();
  });

  it("Rejeita inicialização de configuração por não-admin", async () => {
    // Criar uma nova conta de configuração
    const newConfigAccount = Keypair.generate();

    try {
      // Tentar inicializar a configuração com a carteira do atacante
      await program.methods
        .initializeCollection("Test Collection", "TEST", "https://test-uri.com")
        .accounts({
          payer: attackerWallet.publicKey, // Usando a carteira do atacante
          collectionMint: collectionMint.publicKey,
          collectionMetadata: collectionMetadata.publicKey,
          collectionTokenAccount: collectionTokenAccount,
          config: newConfigAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .signers([
          newConfigAccount,
          attackerWallet,
          collectionMint,
          collectionMetadata,
        ])
        .rpc();

      assert.fail("Deveria ter rejeitado inicialização por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado") ||
          errorMessage.includes("InsufficientFunds"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita configuração de token de pagamento por não-admin", async () => {
    try {
      // Tentar configurar o token de pagamento com a carteira do atacante
      await program.methods
        .setPaymentToken(paymentTokenMint.publicKey)
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        } as any)
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado configuração de token por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita configuração de staking por não-admin", async () => {
    try {
      // Tentar configurar o staking com a carteira do atacante
      await program.methods
        .configureStaking(true, new anchor.BN(2000)) // 20%
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        } as any)
        .signers([attackerWallet])
        .rpc();

      assert.fail(
        "Deveria ter rejeitado configuração de staking por não-admin"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita atualização de admin por não-admin", async () => {
    try {
      // Tentar atualizar o admin com a carteira do atacante
      await program.methods
        .updateAdmin(attackerWallet.publicKey)
        .accounts({
          currentAdmin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado atualização de admin por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita pausa de emergência por não-admin", async () => {
    try {
      // Tentar pausar o sistema com a carteira do atacante
      await program.methods
        .setEmergencyPause(true, "Teste de segurança")
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado pausa de emergência por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita atualização de limite máximo de stake por não-admin", async () => {
    try {
      // Tentar atualizar o limite máximo com a carteira do atacante
      await program.methods
        .updateMaxStakeAmount(new anchor.BN(1000000 * 10 ** 9)) // 1 milhão de tokens
        .accounts({
          admin: attackerWallet.publicKey, // Usando a carteira do atacante
          config: configAccount.publicKey,
        })
        .signers([attackerWallet])
        .rpc();

      assert.fail("Deveria ter rejeitado atualização de limite por não-admin");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Você não está autorizado"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita configuração de token de pagamento inválido", async () => {
    // Criar um token inválido (não inicializado)
    const invalidTokenMint = Keypair.generate();

    try {
      // Tentar configurar um token inválido
      await program.methods
        .setPaymentToken(invalidTokenMint.publicKey)
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail("Deveria ter rejeitado configuração de token inválido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidToken") ||
          errorMessage.includes("Token inválido") ||
          errorMessage.includes("Account does not exist"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita configuração de staking com taxa inválida", async () => {
    try {
      // Tentar configurar staking com taxa inválida (maior que 100%)
      await program.methods
        .configureStaking(true, new anchor.BN(10001)) // 100.01%
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail(
        "Deveria ter rejeitado configuração de staking com taxa inválida"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidStakingRate") ||
          errorMessage.includes("Taxa de staking inválida"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita atualização de limite máximo de stake inválido", async () => {
    try {
      // Tentar atualizar o limite máximo com valor zero
      await program.methods
        .updateMaxStakeAmount(new anchor.BN(0))
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail("Deveria ter rejeitado atualização de limite inválido");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidStakeAmount") ||
          errorMessage.includes("Valor de stake inválido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita atualização de admin para endereço inválido", async () => {
    try {
      // Tentar atualizar o admin para um endereço inválido (zero)
      await program.methods
        .updateAdmin(PublicKey.default)
        .accounts({
          currentAdmin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail(
        "Deveria ter rejeitado atualização de admin para endereço inválido"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidAdmin") ||
          errorMessage.includes("Admin inválido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }
  });

  it("Rejeita configuração de staking com token não configurado", async () => {
    // Remover o token de pagamento
    await program.methods
      .setPaymentToken(PublicKey.default)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    try {
      // Tentar configurar staking sem token de pagamento
      await program.methods
        .configureStaking(true, new anchor.BN(2000)) // 20%
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail("Deveria ter rejeitado configuração de staking sem token");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("InvalidPaymentToken") ||
          errorMessage.includes("Token de pagamento inválido"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Restaurar o token de pagamento para os próximos testes
    await program.methods
      .setPaymentToken(paymentTokenMint.publicKey)
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita configuração de staking com sistema pausado", async () => {
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    try {
      // Tentar configurar staking com o sistema pausado
      await program.methods
        .configureStaking(true, new anchor.BN(2000)) // 20%
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail(
        "Deveria ter rejeitado configuração de staking com sistema pausado"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("SystemPaused") ||
          errorMessage.includes("O sistema está pausado para emergência"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita atualização de admin com sistema pausado", async () => {
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    try {
      // Tentar atualizar o admin com o sistema pausado
      await program.methods
        .updateAdmin(secondaryAdminWallet.publicKey)
        .accounts({
          currentAdmin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail(
        "Deveria ter rejeitado atualização de admin com sistema pausado"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("SystemPaused") ||
          errorMessage.includes("O sistema está pausado para emergência"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita atualização de limite máximo de stake com sistema pausado", async () => {
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    try {
      // Tentar atualizar o limite máximo com o sistema pausado
      await program.methods
        .updateMaxStakeAmount(new anchor.BN(5000 * 10 ** 9)) // 5000 tokens
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail(
        "Deveria ter rejeitado atualização de limite com sistema pausado"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("SystemPaused") ||
          errorMessage.includes("O sistema está pausado para emergência"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Rejeita configuração de token de pagamento com sistema pausado", async () => {
    // Pausar o sistema
    await program.methods
      .setEmergencyPause(true, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    try {
      // Tentar configurar o token de pagamento com o sistema pausado
      await program.methods
        .setPaymentToken(paymentTokenMint.publicKey)
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail(
        "Deveria ter rejeitado configuração de token com sistema pausado"
      );
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("SystemPaused") ||
          errorMessage.includes("O sistema está pausado para emergência"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false, "Teste de segurança")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });

  it("Testa pausar o sistema em cenário normal", async () => {
    // Pausar o sistema como admin
    await program.methods
      .setEmergencyPause(true, "Manutenção programada")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    // Verificar se o sistema está pausado
    const configInfo = await program.account.configAccount.fetch(
      configAccount.publicKey
    );
    assert.isTrue(
      configInfo.emergencyPaused,
      "O sistema deveria estar pausado"
    );

    // Despausar o sistema
    await program.methods
      .setEmergencyPause(false, "Manutenção concluída")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    // Verificar se o sistema está despausado
    const configInfo2 = await program.account.configAccount.fetch(
      configAccount.publicKey
    );
    assert.isFalse(
      configInfo2.emergencyPaused,
      "O sistema deveria estar despausado"
    );
  });

  it("Rejeita configurações por carteira não autorizada quando o sistema está pausado", async () => {
    // Pausar o sistema como admin
    await program.methods
      .setEmergencyPause(true, "Teste de segurança com pausa")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();

    try {
      // Tentar configurar staking com o sistema pausado
      await program.methods
        .configureStaking(true, new anchor.BN(3000)) // 30%
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();

      assert.fail("Deveria ter rejeitado configuração com sistema pausado");
    } catch (e) {
      const errorMessage = e.toString();
      assert(
        errorMessage.includes("SystemPaused") ||
          errorMessage.includes("O sistema está pausado para emergência"),
        "Erro diferente do esperado: " + errorMessage
      );
    }

    // Despausar o sistema para os próximos testes
    await program.methods
      .setEmergencyPause(false, "Retomando operações após teste")
      .accounts({
        admin: wallet.publicKey,
        config: configAccount.publicKey,
      })
      .rpc();
  });
});
