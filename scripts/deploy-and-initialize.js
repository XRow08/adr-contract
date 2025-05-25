const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Definir cores para saída no console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m'
};

// Função para executar um script com tratamento de erro
function runScript(scriptName, skipOnError = false) {
  const scriptPath = path.join(__dirname, scriptName);
  console.log(`\n${colors.bright}${colors.blue}Executando ${scriptName}...${colors.reset}\n`);
  
  try {
    execSync(`node ${scriptPath}`, { stdio: 'inherit' });
    console.log(`\n${colors.green}✓ ${scriptName} executado com sucesso!${colors.reset}\n`);
    return true;
  } catch (error) {
    console.error(`\n${colors.red}✗ Erro ao executar ${scriptName}:${colors.reset}`);
    console.error(error.message);
    
    if (!skipOnError) {
      console.error(`\n${colors.yellow}Processo interrompido. Corrija o erro e tente novamente.${colors.reset}`);
      process.exit(1);
    }
    
    console.warn(`\n${colors.yellow}⚠ Continuando apesar do erro...${colors.reset}\n`);
    return false;
  }
}

// Função principal
async function main() {
  console.log(`\n${colors.bright}${colors.cyan}==========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   DEPLOY E INICIALIZAÇÃO DO PROGRAMA   ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}==========================================${colors.reset}\n`);

  // Verificar se a pasta config existe
  const configDir = path.join(__dirname, '../config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Sequência de scripts a serem executados
  const scripts = [
    'deploy-program.js',         // Deploy do programa
    'initialize-collection.js',  // Inicializar coleção de NFTs
    'create-token.js',           // Criar token de pagamento
    'configure-payment-token.js',// Configurar token de pagamento
    'configure-staking.js',      // Configurar sistema de staking
    'initialize-reward-reserve.js', // Inicializar reserva de recompensas
    'deposit-reward-reserve.js'  // Depositar tokens na reserva
  ];

  // Executar scripts em sequência
  for (const script of scripts) {
    const success = runScript(script);
    if (!success) break;
  }

  console.log(`\n${colors.bright}${colors.green}==========================================${colors.reset}`);
  console.log(`${colors.bright}${colors.green}   DEPLOY E INICIALIZAÇÃO CONCLUÍDOS!   ${colors.reset}`);
  console.log(`${colors.bright}${colors.green}==========================================${colors.reset}\n`);
  
  // Exibir resumo das informações
  try {
    const configPath = path.join(__dirname, '../config/deploy-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      console.log(`${colors.bright}RESUMO:${colors.reset}`);
      console.log(`${colors.cyan}Programa ID:${colors.reset} ${config.programId || 'N/A'}`);
      console.log(`${colors.cyan}Token de Pagamento:${colors.reset} ${config.paymentTokenMint || 'N/A'}`);
      console.log(`${colors.cyan}Coleção NFT:${colors.reset} ${config.collectionMint || 'N/A'}`);
      console.log(`${colors.cyan}Staking:${colors.reset} ${config.stakingEnabled ? 'Habilitado' : 'Desabilitado'}`);
      
      if (config.stakingEnabled) {
        console.log(`${colors.cyan}Taxa de Recompensa:${colors.reset} ${config.stakingRewardRate / 100}%`);
      }
    }
  } catch (error) {
    console.error(`\n${colors.red}Erro ao exibir resumo:${colors.reset}`, error.message);
  }
}

main().catch(err => {
  console.error(`\n${colors.red}Erro não tratado:${colors.reset}`, err);
  process.exit(1);
}); 