import React from 'react';
import SolanaProviders from './frontend-provider-setup';
import NFTMinter from './frontend-example';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
  return (
    <SolanaProviders>
      <div className="App">
        <header>
          <h1>dApp NFT Minter</h1>
          <WalletMultiButton />
        </header>
        
        <main>
          <NFTMinter />
        </main>
        
        <footer>
          <p>Exemplo de integração com contrato Solana</p>
        </footer>
      </div>
    </SolanaProviders>
  );
}

export default App; 