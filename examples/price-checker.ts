import dotenv from 'dotenv';
dotenv.config();

import { CoinGeckoPriceTool } from '../src/tools/coingecko-price-tool';
import { Agent } from '../src/core/agent';
import { RunOptions } from '../src/core/types';
import { OpenAIProvider } from '../src/core/openai-provider';

async function main() {
  // Initialize the CoinGecko price tool
  const coinGeckoPriceTool = new CoinGeckoPriceTool();

  // Create an agent with the OpenAI provider
  const agent = new Agent({
    name: 'CryptoPriceAnalyst',
    provider: new OpenAIProvider({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620',
    }),
    systemPrompt: `You are a cryptocurrency price analyst. You help users get accurate price information 
    about different cryptocurrencies. You can provide the current price, market cap, 24h volume, 
    and 24h price change. Always format monetary values in a readable way with commas as thousand separators.`
  });

  // Define a function to check cryptocurrency prices
  async function checkPrice(tokenId: string) {
    console.log(`Checking price data for ${tokenId}...`);
    
    const options: RunOptions = {
      task: `Get the latest price information for ${tokenId} and provide a brief summary.`,
      tools: [coinGeckoPriceTool],
    };
    
    const result = await agent.run(options);
    console.log(result.response);
  }

  // Example usage: check prices for specific cryptocurrencies
  await checkPrice('bitcoin');
  await checkPrice('ethereum');
  
  // Intentional error to demonstrate error handling
  try {
    await checkPrice('nonexistent-token-12345');
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

main().catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});