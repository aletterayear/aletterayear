import { 
    Connection,
    Keypair,
    PublicKey,
    LAMPORTS_PER_SOL,
    Transaction
} from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import axios from "axios";
import bs58 from "bs58";
import * as fs from 'fs';

interface LaunchConfig {
    name: string;
    ticker: string;
    description: string;
    imageUrl: string;
    purchaseAmount: number; // in SOL
    wallet: {
        publicKey: string;
        privateKey: string | null;
        keypairFile?: string;
    };
}

async function getKeypairFromConfig(config: LaunchConfig): Promise<Keypair> {
    if (config.wallet.privateKey) {
        // Use private key directly if provided
        const decodedKey = bs58.decode(config.wallet.privateKey);
        return Keypair.fromSecretKey(decodedKey);
    } else if (config.wallet.keypairFile) {
        // Read from keypair file
        const fileContent = fs.readFileSync(config.wallet.keypairFile, 'utf-8');
        const secretKey = Uint8Array.from(JSON.parse(fileContent));
        return Keypair.fromSecretKey(secretKey);
    }
    throw new Error('No valid wallet credentials provided');
}

async function launchToken(config: LaunchConfig) {
    try {
        // Initialize connection using Helius
        const HELIUS_API_KEY = "YOUR_API_KEY"; // Replace with your API key
        const connection = new Connection(
            `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
        );

        // Get keypair
        const keypair = await getKeypairFromConfig(config);
        
        // Validate wallet has enough SOL
        const balance = await connection.getBalance(keypair.publicKey);
        const requiredBalance = config.purchaseAmount + 0.1; // Add some for fees
        
        if (balance < requiredBalance * LAMPORTS_PER_SOL) {
            throw new Error(`Insufficient balance. Need at least ${requiredBalance} SOL`);
        }

        // Create token on pump.fun
        const createResponse = await axios.post('https://api.pump.fun/create-token', {
            name: config.name,
            symbol: config.ticker,
            description: config.description,
            image: config.imageUrl,
            wallet: keypair.publicKey.toString()
        });

        if (!createResponse.data.success) {
            throw new Error(`Failed to create token: ${createResponse.data.message}`);
        }

        const tokenMint = createResponse.data.mint;
        console.log(`Token created successfully: ${tokenMint}`);

        // Immediately purchase tokens
        const purchaseResponse = await axios.post('https://api.pump.fun/purchase', {
            mint: tokenMint,
            amount: config.purchaseAmount,
            wallet: keypair.publicKey.toString()
        });

        if (!purchaseResponse.data.success) {
            throw new Error(`Failed to purchase tokens: ${purchaseResponse.data.message}`);
        }

        // Return success information
        return {
            success: true,
            tokenMint,
            name: config.name,
            ticker: config.ticker,
            purchaseAmount: config.purchaseAmount,
            transactionId: purchaseResponse.data.signature
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Command line handling
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 7) {
        console.error('Error: Missing required parameters');
        console.log('Usage: npm run launch -- <token-name> <ticker> <description> <image-url> <purchase-amount> <wallet-public-key> <wallet-private-key-or-file>');
        console.log('Example with private key:');
        console.log('npm run launch -- "My Fun Token" FUN "A fun token" "https://example.com/image.png" 0.5 PublicKey PrivateKey');
        console.log('Example with keypair file:');
        console.log('npm run launch -- "My Fun Token" FUN "A fun token" "https://example.com/image.png" 0.5 PublicKey /path/to/keypair.json');
        process.exit(1);
    }

    const config: LaunchConfig = {
        name: args[0],
        ticker: args[1],
        description: args[2],
        imageUrl: args[3],
        purchaseAmount: parseFloat(args[4]),
        wallet: {
            publicKey: args[5],
            privateKey: null
        }
    };

    // Check if last argument is a file path or private key
    if (args[6].endsWith('.json')) {
        config.wallet.keypairFile = args[6];
    } else {
        config.wallet.privateKey = args[6];
    }

    // Validate purchase amount
    if (isNaN(config.purchaseAmount) || config.purchaseAmount <= 0) {
        console.error('Error: Purchase amount must be a positive number');
        process.exit(1);
    }

    // Launch token
    launchToken(config).then(result => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
    });
} 
