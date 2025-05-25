const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, mintTo, createMintToInstruction } = require('@solana/spl-token');
const fs = require('fs');

async function main() {
    try {
        // Setup da conexão com a Devnet
        const connection = new Connection(
            'https://api.devnet.solana.com',
            { commitment: 'confirmed' }
        );
        console.log("Conectado à", connection.rpcEndpoint);

        // Carregar a wallet do usuário
        const walletKeypair = Keypair.fromSecretKey(
            Buffer.from(JSON.parse(fs.readFileSync('./wallet-dev.json', 'utf-8')))
        );
        console.log("Usando wallet:", walletKeypair.publicKey.toBase58());

        // Token existente - este é o token mencionado anteriormente
        const tokenMint = new PublicKey("2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay");
        console.log("Token Mint:", tokenMint.toBase58());
        
        // Obter o endereço da conta associada
        const associatedTokenAddress = await getAssociatedTokenAddress(
            tokenMint,
            walletKeypair.publicKey
        );
        console.log("Endereço da conta associada:", associatedTokenAddress.toBase58());
        
        // Verificar saldo atual
        try {
            const balance = await connection.getTokenAccountBalance(associatedTokenAddress);
            console.log(`Saldo atual: ${balance.value.uiAmount} tokens`);
            
            if (balance.value.uiAmount > 0) {
                console.log("Você já tem tokens. Não é necessário mintar mais.");
                return;
            }
            
            // Se o saldo for zero, tentar transferir tokens
            console.log("Saldo zero. Tentando verificar a autoridade do mint...");
            
            // Obter informações do mint para ver quem é a autoridade
            const mintInfo = await connection.getAccountInfo(tokenMint);
            console.log("Mint encontrado:", mintInfo ? "Sim" : "Não");
            
            if (mintInfo) {
                console.log("Tamanho dos dados:", mintInfo.data.length);
                console.log("Proprietário:", mintInfo.owner.toBase58());
                
                // Verificar se somos a autoridade de mint
                const mintAuthority = mintInfo.data.slice(4, 36); // Posição da autoridade no layout do token
                const mintAuthorityPubkey = new PublicKey(mintAuthority);
                console.log("Autoridade do mint:", mintAuthorityPubkey.toBase58());
                
                const isOurAuthority = mintAuthorityPubkey.equals(walletKeypair.publicKey);
                console.log("Somos a autoridade de mint?", isOurAuthority);
                
                if (isOurAuthority) {
                    // Mintar tokens para nossa conta
                    console.log("Mintando 1000 tokens para nossa conta...");
                    
                    const amount = 1000 * 10**9; // 1000 tokens com 9 casas decimais
                    
                    const signature = await mintTo(
                        connection,
                        walletKeypair,
                        tokenMint,
                        associatedTokenAddress,
                        walletKeypair.publicKey,
                        amount
                    );
                    
                    console.log("Tokens mintados com sucesso!");
                    console.log("Assinatura:", signature);
                    console.log(`Veja em: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
                    
                    // Verificar novo saldo
                    const newBalance = await connection.getTokenAccountBalance(associatedTokenAddress);
                    console.log(`Novo saldo: ${newBalance.value.uiAmount} tokens`);
                } else {
                    console.log("Não somos a autoridade de mint. Não podemos mintar tokens.");
                    console.log("Você precisará obter tokens de outra forma, como uma transferência de alguém que tenha esses tokens.");
                }
            } else {
                console.log("Não foi possível encontrar informações sobre o mint.");
            }
        } catch (error) {
            console.error("Erro ao verificar saldo:", error);
        }
        
    } catch (error) {
        console.error("Erro:", error);
    }
}

main()
    .then(() => console.log("Concluído!"))
    .catch(console.error); 