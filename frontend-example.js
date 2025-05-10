import { useEffect, useState } from 'react';
import { Connection, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount
} from '@solana/spl-token';
import { useWallet } from '@solana/wallet-adapter-react';

// Você precisa importar o IDL gerado após compilar o programa
import idl from './idl/adr_token_mint.json';

// ID do programa em Solana (substitua pelo ID real do seu programa)
const programId = new PublicKey('9cDdb8o8hnfZjvKffc9pzGhvcEG7dVjg9yXHMDuL975v');

const NFTMinter = () => {
  const wallet = useWallet();
  const [program, setProgram] = useState(null);
  const [collectionMint, setCollectionMint] = useState(null);
  const [collectionMetadata, setCollectionMetadata] = useState(null);
  const [configAccount, setConfigAccount] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Constantes
  const COLLECTION_NAME = "Minha Coleção";
  const COLLECTION_SYMBOL = "COLL";
  const COLLECTION_URI = "https://arweave.net/sua-coleção-metadata";
  
  useEffect(() => {
    // Configura o provider Anchor quando a carteira estiver conectada
    if (wallet.connected) {
      const connection = new Connection("https://api.devnet.solana.com", "confirmed");
      
      const provider = new AnchorProvider(
        connection, 
        wallet,
        { preflightCommitment: "processed" }
      );
      
      const program = new Program(idl, programId, provider);
      setProgram(program);
    }
  }, [wallet.connected]);

  // Função para inicializar a coleção
  const initializeCollection = async () => {
    if (!program) return;
    
    try {
      setLoading(true);
      
      // Criar keypairs para as contas
      const newCollectionMint = Keypair.generate();
      const newCollectionMetadata = Keypair.generate();
      const newConfigAccount = Keypair.generate();
      
      // Calcular endereço da conta de token associada
      const collectionTokenAccount = await getAssociatedTokenAddress(
        newCollectionMint.publicKey,
        wallet.publicKey
      );
      
      // Enviar transação
      const tx = await program.methods
        .initializeCollection(COLLECTION_NAME, COLLECTION_SYMBOL, COLLECTION_URI)
        .accounts({
          payer: wallet.publicKey,
          collectionMint: newCollectionMint.publicKey,
          collectionMetadata: newCollectionMetadata.publicKey,
          collectionTokenAccount,
          config: newConfigAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([newCollectionMint, newCollectionMetadata, newConfigAccount])
        .rpc();
      
      console.log("Coleção inicializada:", tx);
      
      // Salvar as contas criadas para uso posterior
      setCollectionMint(newCollectionMint);
      setCollectionMetadata(newCollectionMetadata);
      setConfigAccount(newConfigAccount);
      
    } catch (error) {
      console.error("Erro ao inicializar coleção:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Função para definir token de pagamento
  const setPaymentToken = async (paymentTokenMint) => {
    if (!program || !configAccount) return;
    
    try {
      setLoading(true);
      
      const tx = await program.methods
        .setPaymentToken(new PublicKey(paymentTokenMint))
        .accounts({
          admin: wallet.publicKey,
          config: configAccount.publicKey,
        })
        .rpc();
      
      console.log("Token de pagamento definido:", tx);
      
    } catch (error) {
      console.error("Erro ao definir token de pagamento:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Função para mintar um NFT
  const mintNFT = async (name, symbol, uri) => {
    if (!program || !collectionMetadata) return;
    
    try {
      setLoading(true);
      
      // Criar keypairs para o NFT
      const nftMint = Keypair.generate();
      const nftMetadata = Keypair.generate();
      
      // Calcular endereço da conta de token associada
      const nftTokenAccount = await getAssociatedTokenAddress(
        nftMint.publicKey,
        wallet.publicKey
      );
      
      // Enviar transação
      const tx = await program.methods
        .mintNft(name, symbol, uri)
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      console.log("NFT mintado:", tx);
      return { tx, nftMint: nftMint.publicKey, nftMetadata: nftMetadata.publicKey };
      
    } catch (error) {
      console.error("Erro ao mintar NFT:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Função para mintar NFT com pagamento
  const mintNFTWithPayment = async (name, symbol, uri, paymentAmount, paymentTokenMint) => {
    if (!program || !collectionMetadata || !configAccount) return;
    
    try {
      setLoading(true);
      
      // Criar keypairs para o NFT
      const nftMint = Keypair.generate();
      const nftMetadata = Keypair.generate();
      
      // Calcular endereços das contas de token
      const nftTokenAccount = await getAssociatedTokenAddress(
        nftMint.publicKey,
        wallet.publicKey
      );
      
      const payerPaymentTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(paymentTokenMint),
        wallet.publicKey
      );
      
      // Enviar transação
      const tx = await program.methods
        .mintNftWithPayment(
          name, 
          symbol, 
          uri, 
          new BN(paymentAmount)
        )
        .accounts({
          payer: wallet.publicKey,
          nftMint: nftMint.publicKey,
          nftMetadata: nftMetadata.publicKey,
          nftTokenAccount,
          collectionMetadata: collectionMetadata.publicKey,
          paymentTokenMint: new PublicKey(paymentTokenMint),
          payerPaymentTokenAccount,
          config: configAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([nftMint, nftMetadata])
        .rpc();
      
      console.log("NFT mintado com pagamento:", tx);
      return { tx, nftMint: nftMint.publicKey, nftMetadata: nftMetadata.publicKey };
      
    } catch (error) {
      console.error("Erro ao mintar NFT com pagamento:", error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <h1>NFT Minter</h1>
      
      {!wallet.connected ? (
        <p>Conecte sua carteira para continuar</p>
      ) : (
        <div>
          <button 
            onClick={initializeCollection} 
            disabled={loading || collectionMetadata !== null}
          >
            Inicializar Coleção
          </button>
          
          {collectionMetadata && (
            <>
              <div>
                <h3>Definir Token de Pagamento</h3>
                <input id="paymentTokenMint" placeholder="Endereço do token de pagamento" />
                <button 
                  onClick={() => {
                    const mintAddress = document.getElementById('paymentTokenMint').value;
                    setPaymentToken(mintAddress);
                  }}
                  disabled={loading}
                >
                  Definir Token
                </button>
              </div>
              
              <div>
                <h3>Mintar NFT</h3>
                <input id="nftName" placeholder="Nome do NFT" />
                <input id="nftSymbol" placeholder="Símbolo do NFT" />
                <input id="nftUri" placeholder="URI dos metadados" />
                <button 
                  onClick={() => {
                    const name = document.getElementById('nftName').value;
                    const symbol = document.getElementById('nftSymbol').value;
                    const uri = document.getElementById('nftUri').value;
                    mintNFT(name, symbol, uri);
                  }}
                  disabled={loading}
                >
                  Mintar NFT
                </button>
              </div>
              
              <div>
                <h3>Mintar NFT com Pagamento</h3>
                <input id="paidNftName" placeholder="Nome do NFT" />
                <input id="paidNftSymbol" placeholder="Símbolo do NFT" />
                <input id="paidNftUri" placeholder="URI dos metadados" />
                <input id="paymentAmount" placeholder="Quantidade de tokens" type="number" />
                <input id="paymentMint" placeholder="Endereço do token de pagamento" />
                <button 
                  onClick={() => {
                    const name = document.getElementById('paidNftName').value;
                    const symbol = document.getElementById('paidNftSymbol').value;
                    const uri = document.getElementById('paidNftUri').value;
                    const amount = document.getElementById('paymentAmount').value;
                    const mint = document.getElementById('paymentMint').value;
                    mintNFTWithPayment(name, symbol, uri, amount, mint);
                  }}
                  disabled={loading}
                >
                  Mintar NFT Pago
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NFTMinter; 