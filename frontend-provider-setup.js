import React, { useMemo } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// Importar estilos
import '@solana/wallet-adapter-react-ui/styles.css';

const SolanaProviders = ({ children }) => {
  // Você pode escolher entre 'mainnet-beta', 'testnet', 'devnet' ou uma URL personalizada
  const network = WalletAdapterNetwork.Devnet;
  
  // Você pode fornecer RPC personalizado
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  
  // Adapters de carteira que você quer suportar
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
    ],
    [network]
  );
  
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default SolanaProviders; 