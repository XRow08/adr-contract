import React from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import StakingComponent from './components/StakingComponent';

// Estilo do wallet adapter
require('@solana/wallet-adapter-react-ui/styles.css');

function App() {
  // Pode ser 'devnet', 'testnet', ou 'mainnet-beta'
  const network = WalletAdapterNetwork.Devnet;

  // Você pode também fornecer um RPC endpoint customizado
  const endpoint = clusterApiUrl(network);

  // @solana/wallet-adapter-wallets inclui adaptadores para várias carteiras
  const wallets = [
    new PhantomWalletAdapter(),
  ];

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="App">
            <header className="App-header">
              <h1>ADR Token e Staking</h1>
              <WalletMultiButton />
            </header>
            <main>
              <StakingComponent />
            </main>
            <footer>
              <p>ADR Token Smart Contract - 2023</p>
            </footer>
          </div>
          <ToastContainer position="bottom-right" />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App; 