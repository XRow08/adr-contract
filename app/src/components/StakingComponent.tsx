import React, { useEffect, useState } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, web3, BN } from '@project-serum/anchor';
import { AdrTokenMint } from '../types/adr_token_mint';
import { 
  PROGRAM_ID, 
  StakingPeriod, 
  StakingSummary, 
  ConfigSummary,
  getStakeSummary,
  stakeTokens,
  unstakeTokens,
  formatTimeRemaining,
  stakingPeriodToString
} from '../helpers/contract-helpers';
import { PublicKey } from '@solana/web3.js';
import { toast } from 'react-toastify';

// Componente de Staking
const StakingComponent: React.FC = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  
  // Estados
  const [program, setProgram] = useState<Program<AdrTokenMint> | null>(null);
  const [stakingSummary, setStakingSummary] = useState<StakingSummary | null>(null);
  const [configSummary, setConfigSummary] = useState<ConfigSummary | null>(null);
  const [tokenMint, setTokenMint] = useState<PublicKey | null>(null);
  const [stakeAmount, setStakeAmount] = useState<string>('');
  const [selectedPeriod, setSelectedPeriod] = useState<StakingPeriod>(StakingPeriod.Minutes1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
  // Efeito para inicializar o programa
  useEffect(() => {
    if (wallet && connection) {
      // Criar o provider
      const provider = new AnchorProvider(
        connection,
        wallet,
        { preflightCommitment: 'processed' }
      );
      
      // Inicializar o programa
      const programId = new PublicKey(PROGRAM_ID);
      
      // Aqui você normalmente carregaria o IDL do programa
      // Para simplificar, vamos assumir que já temos o IDL importado
      
      // Configurar o programa
      // const program = new Program<AdrTokenMint>(IDL, programId, provider);
      // setProgram(program);
      
      // Carregar informações do token
      // loadTokenMint();
    }
  }, [wallet, connection]);
  
  // Efeito para carregar o resumo do staking
  useEffect(() => {
    if (program && wallet && tokenMint) {
      refreshStakingSummary();
    }
  }, [program, wallet, tokenMint]);
  
  // Função para carregar o resumo do staking
  const refreshStakingSummary = async () => {
    if (!program || !wallet || !tokenMint) return;
    
    setIsRefreshing(true);
    try {
      const summary = await getStakeSummary(
        program,
        wallet.publicKey,
        tokenMint
      );
      
      setStakingSummary(summary);
    } catch (error) {
      console.error('Erro ao carregar resumo de staking:', error);
      toast.error('Erro ao carregar informações de staking');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Função para fazer stake
  const handleStake = async () => {
    if (!program || !wallet || !tokenMint) {
      toast.error('Carteira não conectada ou token não configurado');
      return;
    }
    
    const amount = parseFloat(stakeAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Valor de stake inválido');
      return;
    }
    
    setIsLoading(true);
    try {
      // Converter para lamports (9 casas decimais para SOL)
      const lamports = amount * 1_000_000_000;
      
      // Criar a transação
      const tx = await stakeTokens(
        program,
        wallet as unknown as web3.Keypair, // Conversão temporária, ajuste conforme necessário
        tokenMint,
        lamports,
        selectedPeriod
      );
      
      // Enviar a transação
      const signature = await web3.sendAndConfirmTransaction(
        connection,
        tx,
        [wallet as unknown as web3.Keypair], // Conversão temporária, ajuste conforme necessário
      );
      
      toast.success(`Stake realizado com sucesso! Tx: ${signature.substring(0, 8)}...`);
      
      // Atualizar o resumo
      await refreshStakingSummary();
    } catch (error) {
      console.error('Erro ao fazer stake:', error);
      toast.error('Erro ao fazer stake de tokens');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Função para fazer unstake
  const handleUnstake = async () => {
    if (!program || !wallet || !tokenMint) {
      toast.error('Carteira não conectada ou token não configurado');
      return;
    }
    
    if (!stakingSummary?.canUnstake) {
      toast.error('Ainda não é possível resgatar os tokens');
      return;
    }
    
    setIsLoading(true);
    try {
      // Criar a transação
      const tx = await unstakeTokens(
        program,
        wallet as unknown as web3.Keypair, // Conversão temporária, ajuste conforme necessário
        tokenMint,
        tokenMint // Assumindo que o token de recompensa é o mesmo do stake
      );
      
      // Enviar a transação
      const signature = await web3.sendAndConfirmTransaction(
        connection,
        tx,
        [wallet as unknown as web3.Keypair], // Conversão temporária, ajuste conforme necessário
      );
      
      toast.success(`Unstake realizado com sucesso! Tx: ${signature.substring(0, 8)}...`);
      
      // Atualizar o resumo
      await refreshStakingSummary();
    } catch (error) {
      console.error('Erro ao fazer unstake:', error);
      toast.error('Erro ao resgatar tokens do stake');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Renderizar o componente
  return (
    <div className="staking-container">
      <h2>Staking de Tokens</h2>
      
      {!wallet ? (
        <p>Conecte sua carteira para continuar</p>
      ) : !tokenMint ? (
        <p>Carregando informações do token...</p>
      ) : (
        <>
          {/* Resumo do Staking */}
          <div className="staking-summary">
            <h3>Seu Stake Atual</h3>
            {isRefreshing ? (
              <p>Carregando...</p>
            ) : !stakingSummary ? (
              <p>Nenhum stake ativo</p>
            ) : (
              <div>
                <p>
                  <strong>Status:</strong> {stakingSummary.isStaking ? 'Ativo' : 'Inativo'}
                </p>
                {stakingSummary.isStaking && (
                  <>
                    <p>
                      <strong>Quantidade:</strong> {stakingSummary.amount.toNumber() / 1_000_000_000} tokens
                    </p>
                    <p>
                      <strong>Período:</strong> {stakingPeriodToString(stakingSummary.period)}
                    </p>
                    <p>
                      <strong>Recompensa estimada:</strong> {stakingSummary.estimatedReward.toNumber() / 1_000_000_000} tokens
                    </p>
                    <p>
                      <strong>Tempo restante:</strong> {formatTimeRemaining(stakingSummary.timeRemaining.toNumber())}
                    </p>
                    
                    {stakingSummary.canUnstake && (
                      <button 
                        onClick={handleUnstake}
                        disabled={isLoading}
                        className="unstake-button"
                      >
                        {isLoading ? 'Processando...' : 'Resgatar Tokens + Recompensas'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Formulário de Stake */}
          <div className="stake-form">
            <h3>Fazer Stake</h3>
            <div className="form-group">
              <label htmlFor="stakeAmount">Quantidade:</label>
              <input
                id="stakeAmount"
                type="number"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="Quantidade de tokens"
                min="0"
                step="0.1"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="stakePeriod">Período:</label>
              <select
                id="stakePeriod"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(Number(e.target.value) as StakingPeriod)}
              >
                <option value={StakingPeriod.Minutes1}>1 minuto (5% bônus)</option>
                <option value={StakingPeriod.Minutes2}>2 minutos (10% bônus)</option>
                <option value={StakingPeriod.Minutes5}>5 minutos (20% bônus)</option>
                <option value={StakingPeriod.Minutes10}>10 minutos (40% bônus)</option>
                <option value={StakingPeriod.Minutes30}>30 minutos (50% bônus)</option>
              </select>
            </div>
            
            <button
              onClick={handleStake}
              disabled={isLoading || !stakeAmount}
              className="stake-button"
            >
              {isLoading ? 'Processando...' : 'Fazer Stake'}
            </button>
          </div>
          
          {/* Botão de atualização */}
          <button
            onClick={refreshStakingSummary}
            disabled={isRefreshing}
            className="refresh-button"
          >
            {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </>
      )}
    </div>
  );
};

export default StakingComponent; 