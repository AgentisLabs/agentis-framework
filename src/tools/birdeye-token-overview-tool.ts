import axios from 'axios';
import { Tool } from '../core/types';
import { Logger } from '../utils/logger';

/**
 * Interface for BirdEye token overview response
 */
interface BirdEyeTokenOverviewResponse {
  success: boolean;
  data: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    price: number;
    priceChange24hPercent: number;
    
    // Volume and market metrics
    volume24h?: number;
    marketCap?: number;
    liquidity?: number;
    fdv?: number; // Fully diluted value
    
    // Trading activity
    trade24h?: number;
    buy24h?: number;
    sell24h?: number;
    
    // Time-based price changes
    priceChange1hPercent?: number;
    priceChange8hPercent?: number;
    
    // Time-based volume data
    v24h?: number;
    v24hUSD?: number;
    v24hChangePercent?: number;
    v8h?: number;
    v8hUSD?: number;
    v1h?: number;
    v1hUSD?: number;
    
    // Trading metrics for different timeframes
    trade8h?: number;
    buy8h?: number;
    sell8h?: number;
    trade1h?: number;
    buy1h?: number;
    sell1h?: number;
    
    // Wallet activity
    uniqueWallet24h?: number;
    holder?: number;
    
    // Supply data
    supply?: number;
    totalSupply?: number;
    circulatingSupply?: number;
    
    // Media and links
    logoURI?: string;
    extensions?: {
      website?: string;
      twitter?: string;
      discord?: string;
      telegram?: string;
      medium?: string;
      description?: string;
      coingeckoId?: string;
    }
  };
}

/**
 * BirdEyeTokenOverviewTool for fetching detailed token data
 */
export class BirdEyeTokenOverviewTool implements Tool {
  name: string = 'birdeye_token_overview';
  description: string = 'Get detailed information about a specific crypto token by address';
  logger: Logger;
  private apiKey: string;
  private knownTokens: Record<string, string> = {
    // Solana ecosystem
    'SOL': 'So11111111111111111111111111111111111111112',
    'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    'JUP': 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    'PYTH': 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    'RNDR': 'rndrizKT3MK1iimdxRdWabvyPNgLEHQWxNYMhcLJQsn',
    'BONSAI': '8qJrszrng7VvRrVZHP9kgvZUfqAgNAzYzhGvKJGNbBQ6',

    // Major cryptocurrencies (as Solana wrapped tokens)
    'BTC': '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E', // Wrapped BTC on Solana
    'ETH': '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs', // Wrapped Ethereum on Solana
    'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',

    // Layer 2s and scaling solutions (as wrapped tokens on Solana)
    'MATIC': 'C7NNPWuZCNjZBfW5p6JvGsR8pUdsRpEdP1ZAhnoDwj7h', // Polygon
    'ARB': '5zaDj5jiNiNx4Bw2hg7DVTjGVqv9PkTAydyExVHmHjqy', // Arbitrum 
    'OP': '3K6VqpuAb8Y1VfA2aEzFVow11D24XkYF68MjwqAzHtJR', // Optimism

    // AI tokens
    'FET': 'EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp', // Fetch.ai
    'OCEAN': 'E9X7rKAGfSh1gsQzm77pPPRi8ooKgDzEwtQ8M86ofUSY' // Ocean Protocol
  };

  // JSON Schema for the tool parameters
  schema = {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: 'Token symbol (e.g., SOL, BONK) or contract address'
      },
      chain: {
        type: 'string',
        description: 'Blockchain chain (default: solana)'
      }
    },
    required: ['token']
  };

  /**
   * Creates a new BirdEye token overview tool
   * 
   * @param apiKey - Optional API key (defaults to BIRDEYE_API_KEY env var)
   */
  constructor(apiKey?: string) {
    this.logger = new Logger('BirdEyeTokenOverviewTool');
    this.apiKey = apiKey || process.env.BIRDEYE_API_KEY || '80d42b1c2d8141298b7c7b9277df0a26';

    if (!this.apiKey) {
      throw new Error('BirdEye API key is required. Set BIRDEYE_API_KEY environment variable or pass it to the constructor.');
    }
  }

  /**
   * Execute the BirdEye token overview fetch
   * 
   * @param params - Parameters for the API call
   * @returns Promise resolving to token overview data
   */
  async execute(params: Record<string, any>): Promise<any> {
    const { token, chain = 'solana' } = params;

    // Resolve token address from symbol if needed
    let address = token;
    if (this.knownTokens[token.toUpperCase()]) {
      address = this.knownTokens[token.toUpperCase()];
    }

    this.logger.debug('Fetching token overview', { token, address, chain });

    try {
      // Make API request to BirdEye
      const response = await axios.get<BirdEyeTokenOverviewResponse>(
        `https://public-api.birdeye.so/defi/token_overview?address=${address}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.apiKey,
            'accept': 'application/json',
            'x-chain': chain
          }
        }
      );

      if (!response.data.success) {
        throw new Error('BirdEye API returned unsuccessful response');
      }

      // Format and return relevant data
      const tokenData = response.data.data;
      return {
        token: {
          address: tokenData.address,
          symbol: tokenData.symbol,
          name: tokenData.name,
          decimals: tokenData.decimals,
          logo: tokenData.logoURI,

          // Pricing
          price: tokenData.price,
          priceChange24h: tokenData.priceChange24hPercent,

          // Market data
          marketCap: tokenData.marketCap,
          fullyDilutedValue: tokenData.fdv,
          liquidity: tokenData.liquidity,

          // Volume data
          volume24h: tokenData.v24h,
          volume24hUSD: tokenData.v24hUSD,
          volume24hChangePercent: tokenData.v24hChangePercent,

          // Supply info
          supply: tokenData.supply,
          totalSupply: tokenData.totalSupply,
          circulatingSupply: tokenData.circulatingSupply,

          // Trading activity
          trades24h: tokenData.trade24h,
          uniqueWallets24h: tokenData.uniqueWallet24h,
          holders: tokenData.holder,

          // Social/Project info
          links: {
            website: tokenData.extensions?.website,
            twitter: tokenData.extensions?.twitter,
            discord: tokenData.extensions?.discord,
            telegram: tokenData.extensions?.telegram,
            medium: tokenData.extensions?.medium
          },
          description: tokenData.extensions?.description,

          // Raw metrics for chart data
          metrics: {
            last24Hours: {
              priceChange: tokenData.priceChange24hPercent,
              volume: tokenData.v24hUSD,
              trades: tokenData.trade24h,
              buys: tokenData.buy24h,
              sells: tokenData.sell24h
            },
            last8Hours: {
              priceChange: tokenData.priceChange8hPercent,
              volume: tokenData.v8hUSD,
              trades: tokenData.trade8h,
              buys: tokenData.buy8h,
              sells: tokenData.sell8h
            },
            last1Hour: {
              priceChange: tokenData.priceChange1hPercent,
              volume: tokenData.v1hUSD,
              trades: tokenData.trade1h,
              buys: tokenData.buy1h,
              sells: tokenData.sell1h
            }
          }
        }
      };
    } catch (error) {
      this.logger.error('Error fetching token overview from BirdEye', error);

      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`BirdEye API request failed: ${error.response.status} - ${error.response.statusText}`);
      }

      throw new Error(`Failed to fetch token overview from BirdEye API: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}