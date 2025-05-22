const anchor = require('@coral-xyz/anchor');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Constants
const CONFIG_ACCOUNT = new PublicKey('7vyRpER1J34ZWWLsLsVwTJ4zSKxRn1DjmCyB76W626A3');
const NEW_PAYMENT_TOKEN = new PublicKey('2ADpKWBqVKCjaWY2xFkXTPo6v2Z863SefjT2GUfNHhay');

async function verifyTransaction(connection, signature) {
    console.log('Verifying transaction:', signature);
    try {
        const status = await connection.getSignatureStatus(signature);
        if (status.value === null) {
            console.log('Transaction not found. It may have failed or not been processed yet.');
            return false;
        }
        
        if (status.value.err) {
            console.log('Transaction failed:', status.value.err);
            return false;
        }

        if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
            console.log('Transaction confirmed!');
            return true;
        }

        console.log('Transaction status:', status.value.confirmationStatus);
        return false;
    } catch (error) {
        console.error('Error verifying transaction:', error);
        return false;
    }
}

async function main() {
    // Setup connection and provider with longer timeout
    const connection = new Connection(
        process.env.ANCHOR_PROVIDER_URL || 'https://api.devnet.solana.com',
        {
            commitment: 'confirmed',
            confirmTransactionInitialTimeout: 60000 // 60 seconds
        }
    );
    console.log('Using provider URL:', connection.rpcEndpoint);

    // Load wallet from keypair file
    const walletKeypair = Keypair.fromSecretKey(
        Buffer.from(JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.config/solana/id.json'), 'utf-8')))
    );
    console.log('Using wallet:', walletKeypair.publicKey.toBase58());

    // Setup provider
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(walletKeypair), {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
    });
    anchor.setProvider(provider);

    // Load the program from workspace
    const program = anchor.workspace.AdrTokenMint;
    if (!program) {
        throw new Error("Program not found in Anchor workspace. Run 'anchor build' first.");
    }

    try {
        // Check if system is paused
        const config = await program.account.configAccount.fetch(CONFIG_ACCOUNT);
        if (config.emergencyPaused) {
            throw new Error('System is paused. Cannot set payment token.');
        }

        // Check if caller is admin
        if (!config.admin.equals(walletKeypair.publicKey)) {
            throw new Error('Only admin can set payment token.');
        }

        // Set payment token
        console.log('Setting payment token to:', NEW_PAYMENT_TOKEN.toBase58());
        const tx = await program.methods
            .setPaymentToken(NEW_PAYMENT_TOKEN)
            .accounts({
                admin: walletKeypair.publicKey,
                config: CONFIG_ACCOUNT,
            })
            .rpc();

        console.log('Transaction signature:', tx);

        // Try to verify the transaction
        let verified = false;
        for (let i = 0; i < 5; i++) { // Try 5 times
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between attempts
            verified = await verifyTransaction(connection, tx);
            if (verified) break;
        }

        if (!verified) {
            console.log('\nTransaction status unclear. Please check the transaction manually:');
            console.log(`https://explorer.solana.com/tx/${tx}?cluster=devnet`);
            process.exit(1);
        }

        // Verify the update
        const updatedConfig = await program.account.configAccount.fetch(CONFIG_ACCOUNT);
        console.log('\nUpdated config:', {
            paymentTokenMint: updatedConfig.paymentTokenMint.toBase58(),
            admin: updatedConfig.admin.toBase58(),
            stakingEnabled: updatedConfig.stakingEnabled,
            stakingRewardRate: updatedConfig.stakingRewardRate.toString(),
            maxStakeAmount: updatedConfig.maxStakeAmount.toString(),
            emergencyPaused: updatedConfig.emergencyPaused,
        });

    } catch (error) {
        if (error.signature) {
            console.log('\nTransaction was sent but confirmation timed out.');
            console.log('Transaction signature:', error.signature);
            console.log('Please check the transaction status manually:');
            console.log(`https://explorer.solana.com/tx/${error.signature}?cluster=devnet`);
        } else {
            console.error('Error setting payment token:', error);
        }
        process.exit(1);
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        console.error(err);
        process.exit(1);
    }
);
