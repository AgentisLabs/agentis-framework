/**
 * Example using GPT-4o-mini model with the Agentis Framework
 * 
 * This example demonstrates how to configure and use the GPT-4o-mini model
 * which is more cost-effective than standard GPT-4o while still providing
 * good performance.
 */

import * as dotenv from 'dotenv';
import { Agent } from '../src/core/agent';
import { OpenAIProvider } from '../src/core/openai-provider';
import { Logger } from '../src/utils/logger';

// Load environment variables
dotenv.config();

// Set up logging
const logger = new Logger('GPT4o-Mini-Example');

async function main() {
  logger.info('Starting GPT-4o-mini example');
  
  // Create the OpenAI provider with gpt-4o-mini model
  const provider = new OpenAIProvider({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
  });
  
  // Create a simple agent
  const agent = new Agent({
    name: 'GPT4oMiniAgent',
    model: 'gpt-4o-mini',
    systemPrompt: `You are an assistant using the more efficient GPT-4o-mini model.
    You are helpful, knowledgeable, but also cost-effective.
    You provide concise responses while maintaining accuracy.`
  }, provider);
  
  // Demonstrate capabilities with a few queries
  const queries = [
    'What are the main advantages of using smaller language models?',
    'Can you generate a short poem about AI?',
    'Explain quantum computing in simple terms',
    'What is the Agentis Framework?'
  ];
  
  for (const query of queries) {
    logger.info(`Sending query: ${query}`);
    
    try {
      const result = await agent.run({ task: query });
      logger.info(`Response: ${result.response}`);
      
      // Log token usage
      if (result.tokens) {
        logger.info(`Token usage - Input: ${result.tokens.input}, Output: ${result.tokens.output}, Total: ${result.tokens.total}`);
      }
      
      // Add a separator for readability
      console.log('\n' + '-'.repeat(50) + '\n');
      
    } catch (error) {
      logger.error(`Error processing query: ${query}`, error);
    }
  }
  
  logger.info('GPT-4o-mini example completed');
}

// Run the example
if (require.main === module) {
  main().catch(error => {
    logger.error('Error running example', error);
    process.exit(1);
  });
}