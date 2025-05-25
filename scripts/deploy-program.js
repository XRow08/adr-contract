const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Iniciando deploy do programa Anchor...');

try {
  // Construir o programa
  console.log('Construindo o programa...');
  execSync('anchor build', { stdio: 'inherit' });

  // Fazer deploy no devnet
  console.log('Fazendo deploy no devnet...');
  execSync('anchor deploy --provider.cluster devnet', { stdio: 'inherit' });

  console.log('Deploy concluído com sucesso!');
  console.log('ID do programa: AU11ExEVfwpRBaWgBXRKXHyHa3dAHCQsX6cEoFJxceVq');
  
  // Verificar se o diretório config existe, caso não exista, criar
  const configDir = path.join(__dirname, '../config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Criar arquivo de configuração para uso nos próximos scripts
  const deployConfig = {
    programId: 'AU11ExEVfwpRBaWgBXRKXHyHa3dAHCQsX6cEoFJxceVq',
    deployTimestamp: new Date().toISOString()
  };
  
  fs.writeFileSync(
    path.join(configDir, 'deploy-config.json'),
    JSON.stringify(deployConfig, null, 2)
  );
  
  console.log('Informações de deploy salvas em config/deploy-config.json');
} catch (error) {
  console.error('Erro durante o deploy:', error.message);
  process.exit(1);
} 