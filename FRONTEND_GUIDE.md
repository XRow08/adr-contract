# Guia de Integração Frontend com o Contrato ADR Token

Este guia contém informações sobre como integrar seu frontend com o contrato ADR Token deployado na rede Devnet.

## Informações do Deploy

Os seguintes componentes foram deployados na rede Devnet:

- **Programa**: `GKf6NkHokaNXcov4kgPqftFrd9QfJMcgRwaCVSWc5yTz`
- **Dono do Contrato**: `FonqvQ2kFpBFLyNddupwJwuDUcfhHctrbJif43mPqEau`
- **Conta de Configuração**: `HjSxMX1GSGg1TqQtk2eaomNHXXeduSo9tWxVKn4cDLiW`
- **Token de Pagamento**: `2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay`
- **Coleção NFT**: `GC9ZajpR4kVav4Q4mecrMD3JEPE3yDrvhi4tHZh6UAJc`
- **Metadados da Coleção**: `C8FRuzgygmnYnxgS6CnbBBLMe2t5Y5dH6b3q9tsdwUuX`

Todas as informações acima, incluindo as chaves privadas para gerenciamento dos tokens, estão disponíveis no arquivo `deploy-info.json`.

## Integração no Frontend

Para integrar este contrato em um frontend React com o @solana/web3.js e @coral-xyz/anchor:

1. Instale as dependências necessárias:

```bash
npm install @solana/web3.js @coral-xyz/anchor @solana/spl-token
```

2. Configure a conexão com a Devnet e carregue o programa:

```javascript
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./adr_token_mint.json"; // Importe o IDL do contrato

// Configurar a conexão com a Devnet
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// ID do programa
const programId = new PublicKey("GKf6NkHokaNXcov4kgPqftFrd9QfJMcgRwaCVSWc5yTz");

// Endereço da conta de configuração
const configAddress = new PublicKey("HjSxMX1GSGg1TqQtk2eaomNHXXeduSo9tWxVKn4cDLiW");

// Inicializar o programa
const provider = new anchor.AnchorProvider(
  connection,
  window.solana, // ou outro wallet adapter
  { commitment: "confirmed" }
);

const program = new anchor.Program(idl, programId, provider);
```

3. Exemplo de função para mintar um NFT com pagamento:

```javascript
async function mintNFTWithPayment(name, symbol, uri, paymentAmount) {
  try {
    // Contas necessárias
    const wallet = provider.wallet;
    const nftMint = anchor.web3.Keypair.generate();
    const nftMetadata = anchor.web3.Keypair.generate();
    
    // Token de pagamento do deploy
    const paymentTokenMint = new PublicKey("2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
    
    // Metadados da coleção
    const collectionMetadata = new PublicKey("C8FRuzgygmnYnxgS6CnbBBLMe2t5Y5dH6b3q9tsdwUuX");
    
    // Obter a conta associada do token de pagamento do usuário
    const payerPaymentTokenAccount = await getAssociatedTokenAddress(
      paymentTokenMint,
      wallet.publicKey
    );
    
    // Obter a conta associada para o NFT
    const nftTokenAccount = await getAssociatedTokenAddress(
      nftMint.publicKey,
      wallet.publicKey
    );
    
    // Chamar a função do contrato
    const tx = await program.methods
      .mintNftWithPayment(name, symbol, uri, new anchor.BN(paymentAmount))
      .accounts({
        payer: wallet.publicKey,
        nftMint: nftMint.publicKey,
        nftMetadata: nftMetadata.publicKey,
        nftTokenAccount: nftTokenAccount,
        collectionMetadata: collectionMetadata,
        paymentTokenMint: paymentTokenMint,
        payerPaymentTokenAccount: payerPaymentTokenAccount,
        config: configAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([nftMint, nftMetadata])
      .rpc();
      
    console.log("NFT mintado com sucesso:", tx);
    return {
      tx,
      nftMint: nftMint.publicKey.toString(),
      nftMetadata: nftMetadata.publicKey.toString()
    };
  } catch (error) {
    console.error("Erro ao mintar NFT:", error);
    throw error;
  }
}
```

4. Exemplo de função para fazer stake de tokens:

```javascript
async function stakeTokens(amount, period) {
  try {
    // Contas necessárias
    const wallet = provider.wallet;
    const stakeAccount = anchor.web3.Keypair.generate();
    
    // Token de pagamento do deploy (mesmo token usado para staking)
    const tokenMint = new PublicKey("2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
    
    // Obter a conta associada do token do usuário
    const stakerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      wallet.publicKey
    );
    
    // Derivar a autoridade PDA para o stake
    const [stakeAuthority] = await PublicKey.findProgramAddress(
      [Buffer.from("stake_authority")],
      programId
    );
    
    // Derivar a conta de tokens do stake
    const stakeTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      stakeAuthority,
      true // allowOwnerOffCurve
    );
    
    // Convertendo o período para o enum correto
    let stakingPeriod;
    switch (period) {
      case 7: stakingPeriod = { days7: {} }; break;
      case 14: stakingPeriod = { days14: {} }; break;
      case 30: stakingPeriod = { days30: {} }; break;
      case 90: stakingPeriod = { days90: {} }; break;
      case 180: stakingPeriod = { days180: {} }; break;
      default: throw new Error("Período inválido");
    }
    
    // Chamar a função do contrato
    const tx = await program.methods
      .stakeTokens(new anchor.BN(amount), stakingPeriod)
      .accounts({
        staker: wallet.publicKey,
        tokenMint: tokenMint,
        stakerTokenAccount: stakerTokenAccount,
        stakeTokenAccount: stakeTokenAccount,
        stakeAuthority: stakeAuthority,
        stakeAccount: stakeAccount.publicKey,
        config: configAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([stakeAccount])
      .rpc();
      
    console.log("Tokens em stake com sucesso:", tx);
    return {
      tx,
      stakeAccount: stakeAccount.publicKey.toString(),
      amount,
      period
    };
  } catch (error) {
    console.error("Erro ao fazer stake de tokens:", error);
    throw error;
  }
}
```

## Solicitando Tokens de Teste

Para testar o sistema, você precisará de alguns tokens de pagamento. Como você não tem controle direto sobre o token de pagamento no frontend, você pode criar um script de airdrop para enviar tokens para qualquer carteira:

```javascript
// Exemplo de script para airdrop de tokens de teste
async function airdropTokens(recipientWallet, amount) {
  // Carregar as chaves privadas do arquivo deploy-info.json
  const deployInfo = JSON.parse(fs.readFileSync('./deploy-info.json', 'utf-8'));
  
  // Reconstruir o keypair do token mint
  const paymentTokenMint = Keypair.fromSecretKey(
    Uint8Array.from(deployInfo.privateKeys.paymentTokenMint)
  );
  
  // Carregar a wallet de admin
  const adminWallet = loadWalletFromFile('./wallet-dev.json');
  
  // Criar ou obter a conta associada do destinatário
  const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    adminWallet,
    paymentTokenMint.publicKey,
    new PublicKey(recipientWallet)
  );
  
  // Mintar tokens para o destinatário
  const tx = await mintTo(
    connection,
    adminWallet,
    paymentTokenMint.publicKey,
    recipientTokenAccount.address,
    adminWallet,
    amount
  );
  
  console.log(`Enviados ${amount} tokens para ${recipientWallet}, tx: ${tx}`);
  return tx;
}
```

## Observações Importantes

1. **Ambiente de Teste**: Este deploy foi feito na Devnet, que é um ambiente de testes. Os SOL e tokens aqui não têm valor real.

2. **Token Decimal**: O token de pagamento foi criado com 9 casas decimais, o que significa que para transferir 1 token completo, você precisa especificar 1 * 10^9 (1.000.000.000) unidades.

3. **Segurança das Chaves**: O arquivo `deploy-info.json` contém chaves privadas sensíveis. Não compartilhe este arquivo e mantenha-o seguro.

4. **Extensão do Contrato**: Para adicionar novas funcionalidades ou atualizar o contrato, será necessário implantar uma nova versão usando o processo de upgrade do Anchor.

## Recursos Adicionais

- [Documentação do Solana](https://docs.solana.com/)
- [Documentação do Anchor](https://www.anchor-lang.com/)
- [Documentação do SPL Token](https://spl.solana.com/token)
- [Explorador da Devnet](https://explorer.solana.com/?cluster=devnet) 