import axios from 'axios';
import { Tool } from '../core/types';
import { Logger } from '../utils/logger';

/**
 * Interface for BirdEye trending token result
 */
interface BirdEyeTrendingToken {
  symbol: string;
  name: string;
  mintAddress: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  rank: number;
  image?: string;
}

/**
 * Interface for BirdEye trending response
 */
interface BirdEyeTrendingResponse {
  success: boolean;
  data: {
    items?: BirdEyeTrendingToken[];
    tokens?: BirdEyeTrendingToken[];
  };
}

/**
 * BirdEyeTrendingTool for fetching trending tokens on Solana
 */
export class BirdEyeTrendingTool implements Tool {
  name: string = 'birdeye_trending';
  description: string = 'Fetch trending tokens from BirdEye on Solana';
  logger: Logger;
  private apiKey: string;
  
  // JSON Schema for the tool parameters
  schema = {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of trending tokens to return (default: 10, max: 20)'
      }
    }
  };
  
  /**
   * Creates a new BirdEye trending tokens tool
   * 
   * @param apiKey - Optional API key (defaults to BIRDEYE_API_KEY env var)
   */
  constructor(apiKey?: string) {
    this.logger = new Logger('BirdEyeTrendingTool');
    this.apiKey = apiKey || process.env.BIRDEYE_API_KEY || '80d42b1c2d8141298b7c7b9277df0a26';
    
    if (!this.apiKey) {
      throw new Error('BirdEye API key is required. Set BIRDEYE_API_KEY environment variable or pass it to the constructor.');
    }
  }
  
  /**
   * Execute the BirdEye trending tokens fetch
   * 
   * @param params - Parameters for the API call
   * @returns Promise resolving to trending tokens data
   */
  async execute(params: Record<string, any>): Promise<any> {
    const limit = Math.min(params.limit || 20, 20); // Cap at 20 results
    
    this.logger.debug('Executing BirdEye trending tokens fetch', { limit });
    
    try {
      // Make API request to BirdEye using the correct sort parameters
      const response = await axios.get<BirdEyeTrendingResponse>(
        `https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${limit}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.apiKey,
            'accept': 'application/json',
            'x-chain': 'solana'
          }
        }
      );
      
      if (!response.data.success) {
        throw new Error('BirdEye API returned unsuccessful response');
      }
      
      // Format the response
      const responseData = response.data;
      
      // Log to debug the actual structure
      this.logger.debug('BirdEye API response structure', JSON.stringify(responseData, null, 2).substring(0, 500));
      
      // Check response structure
      if (!responseData.data) {
        this.logger.error('BirdEye API returned unexpected structure - no data field');
        throw new Error('No data returned from BirdEye API');
      }
      
      // Extract tokens based on the actual API response structure
      let tokenList = [];
      
      if (responseData.data.tokens && Array.isArray(responseData.data.tokens)) {
        tokenList = responseData.data.tokens;
      } else if (responseData.data.items && Array.isArray(responseData.data.items)) {
        tokenList = responseData.data.items;
      } else if (Array.isArray(responseData.data)) {
        tokenList = responseData.data;
      } else {
        this.logger.error('BirdEye API returned unexpected data structure', responseData.data);
        throw new Error('Could not parse token data from BirdEye API response');
      }
      
      if (tokenList.length === 0) {
        this.logger.warn('No tokens found in BirdEye API response');
        throw new Error('No tokens found in BirdEye API response');
      }
      
      // Map the tokens to our expected format based on the actual API response
      return {
        tokens: tokenList.map(token => ({
          symbol: token.symbol || 'Unknown',
          name: token.name || token.symbol || 'Unknown Token',
          mintAddress: token.address || token.mintAddress || '',
          price: token.price || 0,
          priceChange24h: token.price24hChangePercent || token.priceChange24h || 0,
          volume24h: token.volume24hUSD || token.volume24h || 0,
          marketCap: token.marketcap || token.fdv || token.marketCap || 0,
          rank: token.rank || 0,
          image: token.logoURI || token.image || ''
        }))
      };
    } catch (error) {
      this.logger.error('Error executing BirdEye trending tokens fetch', error);
      
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`BirdEye API request failed: ${error.response.status} - ${error.response.statusText}`);
      }
      
      // Don't return mock data - this should be a real error since we want the real API data
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch trending tokens from BirdEye API: ${errorMessage}`);
    }
  }
}