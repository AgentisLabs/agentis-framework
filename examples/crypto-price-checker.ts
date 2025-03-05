import dotenv from 'dotenv';
dotenv.config();

import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
import { Agent } from '../src/core/agent';
import { RunOptions } from '../src/core/types';
import { OpenAIProvider } from '../src/core/openai-provider';

async function main() {
  console.log('Testing CoinGecko Price Tool directly...');
  
  // Initialize the CoinGecko price tool
  const coinGeckoPriceTool = new CoinGeckoPriceTool();

  // Define a function to check cryptocurrency prices
  async function checkPrice(tokenId: string) {
    console.log(`\nChecking price data for ${tokenId}...`);
    
    try {
      // Call the tool directly
      const result = await coinGeckoPriceTool.execute({ tokenId });
      console.log('Result:');
      console.log(result);
      
      // Try to parse the result as JSON for display
      try {
        const parsedResult = JSON.parse(result);
        console.log('\nFormatted data:');
        console.log(`Price: $${parsedResult.price_usd.toLocaleString()}`);
        console.log(`24h Change: ${parsedResult.price_change_24h_percent.toFixed(2)}%`);
        console.log(`Market Cap: $${parsedResult.market_cap_usd.toLocaleString()}`);
        console.log(`Last Updated: ${new Date(parsedResult.last_updated_at).toLocaleString()}`);
      } catch (parseError) {
        // If it's not valid JSON, it might be an error message
        console.log('Could not parse result as JSON, likely an error message');
      }
    } catch (error) {
      console.error(`Error fetching data for ${tokenId}:`, error);
    }
  }

  // Example usage: check prices for specific cryptocurrencies
  await checkPrice('bitcoin');
  await checkPrice('ethereum');
  await checkPrice('solana');
  
  // Intentional error to demonstrate error handling
  await checkPrice('nonexistent-token-12345');
}

main().catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});