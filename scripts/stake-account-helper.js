// Este é um exemplo de como processar corretamente os dados da conta de stake
// Use este código como referência para o seu frontend

/**
 * Função para obter e processar informações da conta de stake
 */
async function getStakeAccountInfo(program, publicKey, tokenMint) {
  try {
    // Derivar endereço da conta de stake
    const [stakeAccount] = await PublicKey.findProgramAddress(
      [
        Buffer.from('stake_account'),
        publicKey.toBuffer(),
        tokenMint.toBuffer(),
      ],
      program.programId
    );

    // Buscar a conta de stake
    const stakeInfo = await program.account.stakeAccount.fetch(stakeAccount);
    console.log("Stake Info Raw:", stakeInfo);

    // Processar os dados
    const amount = stakeInfo.amount.toNumber() / 1e9;
    const startTime = new Date(stakeInfo.startTime.toNumber() * 1000);
    const unlockTime = new Date(stakeInfo.unlockTime.toNumber() * 1000);
    
    // Identificar o período de staking corretamente
    // O período no contrato é um objeto enum como { minutes1: {} }
    let period = "unknown";
    
    // Verificar cada possível valor do enum
    if (stakeInfo.period.minutes1 !== undefined) period = "minutes1";
    else if (stakeInfo.period.minutes2 !== undefined) period = "minutes2";
    else if (stakeInfo.period.minutes5 !== undefined) period = "minutes5";
    else if (stakeInfo.period.minutes10 !== undefined) period = "minutes10";
    else if (stakeInfo.period.minutes30 !== undefined) period = "minutes30";
    
    // Calcular tempo restante
    const now = Date.now() / 1000;
    const secondsLeft = stakeInfo.unlockTime.toNumber() - now;
    
    return {
      amount,
      startTime,
      unlockTime,
      period,
      claimed: stakeInfo.claimed,
      secondsLeft: Math.max(0, secondsLeft),
      canUnstake: secondsLeft <= 0 && !stakeInfo.claimed
    };
  } catch (error) {
    console.error("Erro ao buscar conta de stake:", error);
    return null;
  }
}

/**
 * Exemplo de como converter o período para exibição ao usuário
 */
function periodToDisplay(period) {
  const displayMap = {
    minutes1: "1 Minuto (5% APY)",
    minutes2: "2 Minutos (10% APY)",
    minutes5: "5 Minutos (20% APY)",
    minutes10: "10 Minutos (40% APY)",
    minutes30: "30 Minutos (50% APY)",
    unknown: "Desconhecido"
  };
  
  return displayMap[period] || displayMap.unknown;
}

/**
 * Exemplo de como formatar o tempo restante
 */
function formatTimeRemaining(seconds) {
  if (seconds <= 0) return 'Disponível agora';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  if (minutes === 0) {
    return `${remainingSeconds} segundos`;
  } else if (minutes === 1) {
    return `1 minuto e ${remainingSeconds} segundos`;
  } else {
    return `${minutes} minutos e ${remainingSeconds} segundos`;
  }
}

// Exemplo de como usar no React:
/*
import { useEffect, useState } from 'react';

function StakingComponent() {
  const [stakeInfo, setStakeInfo] = useState(null);
  
  useEffect(() => {
    async function fetchStakeInfo() {
      // Inicializar seu programa Anchor aqui
      const info = await getStakeAccountInfo(program, publicKey, tokenMint);
      setStakeInfo(info);
    }
    
    fetchStakeInfo();
  }, [publicKey]);
  
  if (!stakeInfo) return <div>Carregando...</div>;
  
  return (
    <div>
      <h2>Informações de Stake</h2>
      <p>Quantidade: {stakeInfo.amount} tokens</p>
      <p>Período: {periodToDisplay(stakeInfo.period)}</p>
      <p>Início: {stakeInfo.startTime.toLocaleString()}</p>
      <p>Desbloqueio: {stakeInfo.unlockTime.toLocaleString()}</p>
      <p>Tempo restante: {formatTimeRemaining(stakeInfo.secondsLeft)}</p>
      <p>Status: {stakeInfo.claimed ? 'Reivindicado' : (stakeInfo.canUnstake ? 'Disponível para reivindicar' : 'Em stake')}</p>
    </div>
  );
}
*/ 