import axios from 'axios';
import { Tool } from '../core/types';
import { Logger } from '../utils/logger';

const logger = new Logger('CoinGeckoPriceTool');

/**
 * Response structure for CoinGecko price API
 */
interface CoinGeckoPriceResponse {
  [tokenId: string]: {
    usd: number;
    usd_market_cap: number;
    usd_24h_vol: number;
    usd_24h_change: number;
    last_updated_at: number;
  };
}

/**
 * A tool that fetches token price data from CoinGecko API
 */
export class CoinGeckoPriceTool implements Tool {
  name = 'coingecko-price-tool';
  description = 'Fetches current price data for a cryptocurrency token using its CoinGecko ID (e.g., "bitcoin", "ethereum"). Returns price in USD, market cap, 24h volume, 24h price change, and last updated timestamp.';
  
  private apiKey: string;
  
  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.COINGECKO_API_KEY || 'CG-WycHXDqujHUkpXW8CE828DZy'; // Default demo key
  }
  
  schema = {
    type: 'object',
    properties: {
      tokenId: {
        type: 'string',
        description: 'The CoinGecko ID of the token (e.g., "bitcoin", "ethereum", "solana")',
      },
    },
    required: ['tokenId'],
  };
  
  async execute(params: Record<string, any>): Promise<string> {
    const tokenId = params.tokenId as string;
    try {
      logger.debug(`Fetching price data for token: ${tokenId}`);
      
      const response = await axios.get<CoinGeckoPriceResponse>(
        `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true&precision=0`,
        {
          headers: {
            'accept': 'application/json',
            'x-cg-demo-api-key': this.apiKey,
          },
        }
      );
      
      if (!response.data || !response.data[tokenId]) {
        logger.error(`No data found for token ID: ${tokenId}`);
        return `Error: No price data found for token ID "${tokenId}". Please verify the token ID is correct.`;
      }
      
      const priceData = response.data[tokenId];
      
      // Format the response
      const formattedResponse = {
        token: tokenId,
        price_usd: priceData.usd,
        market_cap_usd: priceData.usd_market_cap,
        volume_24h_usd: priceData.usd_24h_vol,
        price_change_24h_percent: priceData.usd_24h_change,
        last_updated_at: new Date(priceData.last_updated_at * 1000).toISOString(),
      };
      
      logger.debug(`Successfully fetched price data for ${tokenId}`);
      return JSON.stringify(formattedResponse, null, 2);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;
        if (statusCode === 429) {
          logger.error('CoinGecko API rate limit exceeded');
          return 'Error: CoinGecko API rate limit exceeded. Please try again later.';
        }
        if (statusCode === 404) {
          logger.error(`Token ID "${tokenId}" not found`);
          return `Error: Token ID "${tokenId}" not found. Please check the token ID and try again.`;
        }
        logger.error(`API Error: ${error.message}`);
        return `Error fetching price data: ${error.message}`;
      }
      
      logger.error(`Unexpected error: ${error}`);
      return `An unexpected error occurred: ${error}`;
    }
  }
}